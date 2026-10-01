// The connection to one MQTT broker: connects with a growing delay between retries, shares
// subscriptions by topic (a topic is subscribed once however many keys need it), keeps the last
// payload of every topic it receives, and reports its state. Knows nothing of Stream Deck.
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import { parseBrokerUrl, type BrokerAddress } from "./url";

export type BrokerConfig = {
    url?: string;
    user?: string;
    password?: string;
    allowSelfSigned?: boolean;
    clientId: string;
};

/** "denied": the broker refused the login; HAC stops retrying until the settings change. */
export type BrokerState = "unconfigured" | "invalid" | "connecting" | "online" | "offline" | "denied";

export type Message = { payload: string; retained: boolean; at: number };

type Logger = { info(msg: string): void; warn(msg: string): void };

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;
/** CONNACK codes for a refused login: v3.1.1 (4, 5) and v5 (134, 135). */
const DENIED_CODES = new Set([4, 5, 134, 135]);

export class Broker {
    private client: MqttClient | undefined;
    private configKey = "";
    private retryMs = MIN_RETRY_MS;
    /** Topic filter → owners (keys, the settings panel). */
    private readonly subs = new Map<string, Set<string>>();
    private readonly values = new Map<string, Message>();
    private readonly stateListeners = new Set<() => void>();
    private readonly messageListeners = new Set<(topic: string, msg: Message) => void>();
    state: BrokerState = "unconfigured";
    address: BrokerAddress | undefined;
    /** Why the last attempt failed, for the status line. */
    lastError: string | undefined;

    constructor(private readonly log: Logger = console) {}

    /** Apply settings; reconnects only when something relevant changed (or `force`). */
    configure(config: BrokerConfig, force = false): void {
        const key = JSON.stringify([config.url?.trim(), config.user ?? "", config.password ?? "", !!config.allowSelfSigned, config.clientId]);
        if (key === this.configKey && !force) return;
        this.configKey = key;
        this.close();
        this.values.clear();
        this.address = parseBrokerUrl(config.url);
        this.lastError = undefined;
        if (!config.url?.trim()) return this.setState("unconfigured");
        if (!this.address) return this.setState("invalid");
        this.connect(this.address, config);
    }

    /** Stop and forget the connection (plugin shutdown, tests). */
    close(): void {
        const c = this.client;
        this.client = undefined;
        c?.removeAllListeners();
        c?.on("error", () => {});
        c?.end(true);
    }

    /** Ask for a topic (filter); `owner` identifies who wants it, so it is unsubscribed when nobody does. */
    subscribe(topic: string, owner: string): void {
        if (!topic) return;
        let owners = this.subs.get(topic);
        if (!owners) {
            this.subs.set(topic, (owners = new Set()));
            if (this.state === "online") this.client?.subscribe(topic, { qos: 0 });
        }
        owners.add(owner);
    }

    unsubscribe(topic: string, owner: string): void {
        const owners = this.subs.get(topic);
        if (!owners?.delete(owner) || owners.size) return;
        this.subs.delete(topic);
        if (this.state === "online") this.client?.unsubscribe(topic);
        // Values seen only through this filter are kept: they are still the best we know
    }

    /** Drop every subscription of an owner (a key that disappeared). */
    release(owner: string): void {
        for (const [topic, owners] of [...this.subs]) if (owners.has(owner)) this.unsubscribe(topic, owner);
    }

    /** The last payload of a topic, if any arrived since connecting. */
    value(topic: string): Message | undefined {
        return this.values.get(topic);
    }

    /** How many topics have a known payload. */
    get topicCount(): number {
        return this.values.size;
    }

    /** All topics with a known payload. */
    topics(): IterableIterator<[string, Message]> {
        return this.values.entries();
    }

    publish(topic: string, payload: string, opts: { retain?: boolean; qos?: 0 | 1 | 2 } = {}): boolean {
        if (this.state !== "online" || !this.client || !topic) return false;
        this.client.publish(topic, payload, { retain: !!opts.retain, qos: opts.qos ?? 0 });
        return true;
    }

    onState(fn: () => void): () => void {
        this.stateListeners.add(fn);
        return () => this.stateListeners.delete(fn);
    }

    onMessage(fn: (topic: string, msg: Message) => void): () => void {
        this.messageListeners.add(fn);
        return () => this.messageListeners.delete(fn);
    }

    private connect(address: BrokerAddress, config: BrokerConfig): void {
        this.setState("connecting");
        this.retryMs = MIN_RETRY_MS;
        const opts: IClientOptions = {
            clientId: config.clientId,
            username: config.user || undefined,
            password: config.password || undefined,
            reconnectPeriod: this.retryMs,
            connectTimeout: 8000,
            rejectUnauthorized: !config.allowSelfSigned,
            protocolVersion: 4,
        };
        const client = mqtt.connect(address.url, opts);
        this.client = client;
        client.on("connect", () => {
            this.retryMs = MIN_RETRY_MS;
            client.options.reconnectPeriod = this.retryMs;
            this.lastError = undefined;
            const topics = [...this.subs.keys()];
            if (topics.length) client.subscribe(topics, { qos: 0 });
            this.log.info(`[mqtt] connected to ${address.url}`);
            this.setState("online");
        });
        client.on("message", (topic, payload, packet) => {
            const msg: Message = { payload: payload.toString("utf8"), retained: packet.retain, at: Date.now() };
            this.values.set(topic, msg);
            for (const fn of this.messageListeners) fn(topic, msg);
        });
        client.on("error", (e: Error & { code?: number | string }) => {
            if (typeof e.code === "number" && DENIED_CODES.has(e.code)) {
                this.lastError = e.message;
                this.log.warn(`[mqtt] ${address.url}: login refused (${e.message})`);
                this.close();
                this.setState("denied");
                return;
            }
            this.lastError = e.message;
            this.log.warn(`[mqtt] ${address.url}: ${e.message}`);
        });
        client.on("close", () => {
            if (this.client !== client) return;
            // Wait longer after each failed attempt; mqtt.js reads the period when it schedules
            this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
            client.options.reconnectPeriod = this.retryMs;
            this.setState("offline");
        });
    }

    private setState(state: BrokerState): void {
        if (state === this.state) return;
        this.state = state;
        for (const fn of this.stateListeners) fn();
    }
}

/** A client id for this installation: "hac-" and 8 random hex digits. */
export function newClientId(): string {
    return `hac-${Math.random().toString(16).slice(2, 10).padEnd(8, "0")}`;
}
