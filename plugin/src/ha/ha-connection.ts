// The connection to one Home Assistant over its WebSocket API (home-assistant-js-websocket):
// connects with a long-lived token, retries with a growing delay until HA answers, keeps every
// entity's state, reads the area/device/entity registries for the picker, calls services, and
// reports its state. Once connected, the library reconnects by itself.
// Knows nothing of Stream Deck.
import { callService, createConnection, createLongLivedTokenAuth, ERR_CANNOT_CONNECT, ERR_INVALID_AUTH, subscribeEntities, type Connection, type HassEntities } from "home-assistant-js-websocket";
import { parseHaUrl, type HaAddress } from "./url";

export type HaConfig = { url?: string; token?: string };

/** The same states as the broker's; "denied": HA refused the token, retrying stops until the settings change. */
export type HaState = "unconfigured" | "invalid" | "connecting" | "online" | "offline" | "denied";

/** What the picker needs from HA's registries (only the fields HA-C reads). */
export type HaRegistry = {
    areas: { area_id: string; name: string }[];
    devices: { id: string; name: string | null; name_by_user: string | null; area_id: string | null }[];
    entities: { entity_id: string; device_id: string | null; area_id: string | null; entity_category: string | null; hidden_by: string | null; disabled_by: string | null }[];
};

/** How long the registries are reused before they are read again. */
const REGISTRY_MS = 60_000;

type Logger = { info(msg: string): void; warn(msg: string): void };

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

export class HaConnection {
    private conn: Connection | undefined;
    private configKey = "";
    /** Bumped by every configure(), so a slow attempt for old settings is dropped. */
    private attempt = 0;
    private retryTimer: ReturnType<typeof setTimeout> | undefined;
    private unsubscribe: (() => void) | undefined;
    private readonly stateListeners = new Set<() => void>();
    private readonly entityListeners = new Set<(entities: HassEntities) => void>();
    state: HaState = "unconfigured";
    address: HaAddress | undefined;
    /** Why the last attempt failed, for the status line. */
    lastError: string | undefined;
    /** HA's version, once connected ("2026.9.4"). */
    version: string | undefined;
    entities: HassEntities = {};
    private registryCache: { at: number; value: Promise<HaRegistry> } | undefined;

    constructor(private readonly log: Logger = console) {}

    /** Apply settings; reconnects only when something relevant changed (or `force`). */
    configure(config: HaConfig, force = false): void {
        const key = JSON.stringify([config.url?.trim(), config.token?.trim() ?? ""]);
        if (key === this.configKey && !force) return;
        this.configKey = key;
        this.close();
        this.entities = {};
        this.version = undefined;
        this.registryCache = undefined;
        this.address = parseHaUrl(config.url);
        this.lastError = undefined;
        if (!config.url?.trim() && !config.token?.trim()) return this.setState("unconfigured");
        if (!this.address) return this.setState("invalid");
        if (!config.token?.trim()) return this.setState("unconfigured");
        void this.connect(this.address, config.token.trim(), ++this.attempt, MIN_RETRY_MS);
    }

    /** Stop and forget the connection (plugin shutdown, tests). */
    close(): void {
        this.attempt++;
        clearTimeout(this.retryTimer);
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.conn?.close();
        this.conn = undefined;
    }

    /** The open connection, for service calls and registry lookups. */
    get connection(): Connection | undefined {
        return this.state === "online" ? this.conn : undefined;
    }

    get entityCount(): number {
        return Object.keys(this.entities).length;
    }

    /** Areas, devices and entity entries; read once a minute at most. */
    registry(): Promise<HaRegistry> {
        const conn = this.connection;
        if (!conn) return Promise.resolve({ areas: [], devices: [], entities: [] });
        if (this.registryCache && Date.now() - this.registryCache.at < REGISTRY_MS) return this.registryCache.value;
        const value = Promise.all([
            conn.sendMessagePromise<HaRegistry["areas"]>({ type: "config/area_registry/list" }),
            conn.sendMessagePromise<HaRegistry["devices"]>({ type: "config/device_registry/list" }),
            conn.sendMessagePromise<HaRegistry["entities"]>({ type: "config/entity_registry/list" }),
        ]).then(([areas, devices, entities]) => ({ areas, devices, entities }));
        this.registryCache = { at: Date.now(), value };
        value.catch(() => (this.registryCache = undefined));
        return value;
    }

    /** Call a service on one entity ("light", "turn_on", "light.desk"); false when not connected or HA refused. */
    async call(domain: string, service: string, entityId: string): Promise<boolean> {
        const conn = this.connection;
        if (!conn) return false;
        try {
            await callService(conn, domain, service, undefined, { entity_id: entityId });
            return true;
        } catch (e) {
            this.log.warn(`[ha] ${domain}.${service} ${entityId}: ${JSON.stringify(e)}`);
            return false;
        }
    }

    onState(fn: () => void): () => void {
        this.stateListeners.add(fn);
        return () => this.stateListeners.delete(fn);
    }

    /** Called with all entities whenever one of them changes. */
    onEntities(fn: (entities: HassEntities) => void): () => void {
        this.entityListeners.add(fn);
        return () => this.entityListeners.delete(fn);
    }

    private async connect(address: HaAddress, token: string, attempt: number, retryMs: number): Promise<void> {
        this.setState("connecting");
        let conn: Connection;
        try {
            conn = await createConnection({ auth: createLongLivedTokenAuth(address.url, token) });
        } catch (e) {
            if (attempt !== this.attempt) return;
            if (e === ERR_INVALID_AUTH) {
                this.lastError = "invalid token";
                this.log.warn(`[ha] ${address.url}: token refused`);
                return this.setState("denied");
            }
            this.lastError = e === ERR_CANNOT_CONNECT ? "cannot connect" : String(e);
            this.log.warn(`[ha] ${address.url}: ${this.lastError}`);
            this.setState("offline");
            this.retryTimer = setTimeout(() => void this.connect(address, token, attempt, Math.min(retryMs * 2, MAX_RETRY_MS)), retryMs);
            return;
        }
        if (attempt !== this.attempt) return conn.close();
        this.conn = conn;
        this.version = conn.haVersion;
        conn.addEventListener("ready", () => {
            this.lastError = undefined;
            this.setState("online");
        });
        conn.addEventListener("disconnected", () => this.setState("offline"));
        conn.addEventListener("reconnect-error", (_c, err) => {
            if (err !== ERR_INVALID_AUTH) return;
            this.lastError = "invalid token";
            this.log.warn(`[ha] ${address.url}: token refused`);
            this.close();
            this.setState("denied");
        });
        this.unsubscribe = subscribeEntities(conn, (entities) => {
            this.entities = entities;
            for (const fn of this.entityListeners) fn(entities);
        });
        this.log.info(`[ha] connected to ${address.url} (Home Assistant ${conn.haVersion})`);
        this.setState("online");
    }

    private setState(state: HaState): void {
        if (state === this.state) return;
        this.state = state;
        for (const fn of this.stateListeners) fn();
    }
}
