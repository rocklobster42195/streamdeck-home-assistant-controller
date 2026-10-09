// HA-C in Home Assistant (opt-in, "Stream Deck in Home Assistant anzeigen"; grills 2026-10-01 and
// 2026-10-09): the bridge device "HA-C auf <PC>" over MQTT Discovery, with the sensor "Coverfarbe"
// that follows the deck's active player (apps too). Without a broker the sensor is set through
// HA's REST API instead (no device; gone after an HA restart until written again). Switched off,
// what HA-C put there is removed: the retained discovery topics are emptied, the REST state deleted.
// Knows nothing of Stream Deck.
import { ACTIVE_ANY_PLAYER, type PlayerBoard } from "@rocklobster42195/streamdeck-kit";
import type { Broker } from "../mqtt/broker";
import type { HaConnection } from "../ha/ha-connection";
import { coverColorReport, type CoverColorReport } from "./cover-color";
import { bridgeTopics, COVER_COLOR_ENTITY, coverColorConfig, type BridgeInfo } from "./discovery";

/** How long a colour must stay before it is reported (a track change may flash a wrong one). */
export const SETTLE_MS = 1000;
const OWNER = "ha-device";

export type HaDeviceMode = "off" | "mqtt" | "rest";

export type HaDeviceOptions = {
    board: Pick<PlayerBoard, "resolve" | "onChange">;
    broker: Pick<Broker, "state" | "publish" | "subscribe" | "onState" | "onMessage">;
    ha: Pick<HaConnection, "state" | "entities" | "registry" | "setRestState" | "deleteRestState" | "onState">;
    /** Undefined until the client id is known. */
    info: () => BridgeInfo | undefined;
    settleMs?: number;
};

export class HaDevice {
    private enabled = false;
    private report: CoverColorReport | undefined;
    private pending: CoverColorReport | undefined;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private subscribed = "";
    private restChecked = false;
    /** The Coverlicht keys: whether one is on, and their lamps (attributes of the sensor). */
    private light = { on: false, lamps: [] as string[] };
    private readonly offs: (() => void)[] = [];

    constructor(private readonly o: HaDeviceOptions) {
        this.offs.push(
            o.board.onChange(() => this.playersChanged()),
            o.broker.onState(() => this.sync()),
            o.ha.onState(() => {
                this.restChecked = false;
                this.sync();
            }),
            o.broker.onMessage((topic, msg) => this.message(topic, msg.payload)),
        );
    }

    get mode(): HaDeviceMode {
        if (!this.enabled) return "off";
        return this.o.broker.state === "unconfigured" || this.o.broker.state === "invalid" ? "rest" : "mqtt";
    }

    setEnabled(on: boolean): void {
        if (on === this.enabled) return;
        this.enabled = on;
        this.restChecked = false;
        this.sync();
        this.playersChanged();
    }

    /** The Coverlicht keys' switch position, reported with the colour. */
    setCoverLight(on: boolean, lamps: string[]): void {
        if (on === this.light.on && JSON.stringify(lamps) === JSON.stringify(this.light.lamps)) return;
        this.light = { on, lamps };
        this.playersChanged();
    }

    dispose(): void {
        clearTimeout(this.timer);
        for (const off of this.offs) off();
    }

    /** Publishes the device (on connect) and cleans up what isn't wanted any more. */
    private sync(): void {
        const info = this.o.info();
        if (!info) return;
        const t = bridgeTopics(info.nodeId);
        // Listen to our own config topic: a retained one while off is ours to remove
        if (this.o.broker.state === "online" && this.subscribed !== t.coverColor.config) {
            this.o.broker.subscribe(t.coverColor.config, OWNER);
            this.subscribed = t.coverColor.config;
        }
        if (this.mode === "mqtt" && this.o.broker.state === "online") {
            this.o.broker.publish(t.coverColor.config, JSON.stringify(coverColorConfig(info)), { retain: true, qos: 1 });
            this.o.broker.publish(t.status, "online", { retain: true, qos: 1 });
            if (this.report) this.write(this.report);
        }
        if (this.mode === "rest" && this.o.ha.state === "online" && this.report) this.write(this.report);
        if (this.mode !== "rest" && this.o.ha.state === "online" && !this.restChecked) {
            this.restChecked = true;
            void this.removeRestState();
        }
    }

    private message(topic: string, payload: string): void {
        const info = this.o.info();
        if (!info || this.mode === "mqtt" || !payload) return;
        const t = bridgeTopics(info.nodeId);
        if (topic !== t.coverColor.config) return;
        // Off (or REST): empty the retained topics, so HA removes the device
        for (const old of [t.coverColor.config, t.coverColor.attributes, t.coverColor.state, t.status]) this.o.broker.publish(old, "", { retain: true, qos: 1 });
    }

    /** A state we set over REST earlier (it has no registry entry; the MQTT sensor has one). */
    private async removeRestState(): Promise<void> {
        if (!this.o.ha.entities[COVER_COLOR_ENTITY]) return;
        const registry = await this.o.ha.registry();
        if (registry.entities.some((e) => e.entity_id === COVER_COLOR_ENTITY)) return;
        if (this.mode !== "rest") await this.o.ha.deleteRestState(COVER_COLOR_ENTITY);
    }

    private playersChanged(): void {
        if (this.mode === "off") return;
        // No colour: the sensor keeps the last one (a switched Coverlicht key still updates it)
        const base = coverColorReport(this.o.board.resolve(ACTIVE_ANY_PLAYER)) ?? this.pending ?? this.report;
        if (!base) return;
        const next: CoverColorReport = { state: base.state, attributes: { ...base.attributes, cover_light: this.light.on, cover_light_lamps: this.light.lamps } };
        if (same(next, this.pending ?? this.report)) return;
        this.pending = next;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            const r = this.pending;
            this.pending = undefined;
            if (!r || same(r, this.report)) return;
            this.report = r;
            this.write(r);
        }, this.o.settleMs ?? SETTLE_MS);
    }

    private write(r: CoverColorReport): void {
        const info = this.o.info();
        if (!info) return;
        if (this.mode === "mqtt") {
            const t = bridgeTopics(info.nodeId).coverColor;
            // Attributes first: an automation triggered by the state reads them
            this.o.broker.publish(t.attributes, JSON.stringify(r.attributes), { retain: true });
            this.o.broker.publish(t.state, r.state, { retain: true });
        } else if (this.mode === "rest") {
            void this.o.ha.setRestState(COVER_COLOR_ENTITY, r.state, { ...r.attributes, friendly_name: info.language.startsWith("de") ? "Coverfarbe" : "Cover colour", icon: "mdi:palette" });
        }
    }
}

function same(a: CoverColorReport, b: CoverColorReport | undefined): boolean {
    return !!b && JSON.stringify(a) === JSON.stringify(b);
}
