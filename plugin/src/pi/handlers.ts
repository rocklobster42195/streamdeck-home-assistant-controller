// HAC's part of the kit's PI bridge: the status of both connections, the search for Home
// Assistant on the network, the topic search for the topic fields,
// and what HAC knows about one topic (its payload, JSON fields, a scheme suggestion). While a
// settings panel is open, HAC listens to every topic ("#"), so the search sees the whole broker.
import streamDeck from "@elgato/streamdeck";
import { deckPeers } from "../bus/hac-bus";
import { registerDiagnostics, piBridge, type PiPushMessage } from "@rocklobster42195/streamdeck-kit/bridge";
import { mdiOptions } from "@rocklobster42195/streamdeck-kit/mdi";
import { playerOptions } from "@rocklobster42195/streamdeck-kit";
import { hacPlayers } from "../bus/hac-players";
import { proxyPasswordState, reconnectBroker, reconnectHa, setProxyPassword } from "../connections";
import { ha } from "../ha/connection";
import { haAttributes, haName } from "../ha/entities";
import { shortHaAddress } from "../ha/url";
import { findHomeAssistants } from "../ha/zeroconf";
import { broker } from "../mqtt/connection";
import { jsonFields } from "../mqtt/payload";
import { suggestForTopic, type TopicSuggestion } from "../mqtt/schemes";
import { shortAddress } from "../mqtt/url";
import { initHaDiscovery } from "../discovery/ha-discovery";
import { initDevicePicker } from "./devices";
import { initExplore } from "./explore";
import { panoramaRows } from "../bus/hac-bus";
import type { ConnectionStatus, HaStatus, PiPush, TopicHit } from "./protocol";

const PI_OWNER = "settings-panel";
const MAX_HITS = 40;

export function initPiBridge(): void {
    piBridge.init();
    // "Diagnostics" in the settings window: the log, a report to copy, the issue page
    registerDiagnostics(piBridge, { issueUrl: "https://github.com/rocklobster42195/streamdeck-home-assistant-controller/issues", peers: deckPeers });
    piBridge.registerOptions("mdi-icons", mdiOptions);
    // The Coverlicht key: the deck's players, and the lamps that can take a colour
    piBridge.registerOptions("players", () => playerOptions(hacPlayers.players()));
    piBridge.registerOptions("color-lights", () => colorLights());
    // The Slider dials' Panorama section (<pi-panorama>): the row's effect, dials and settings
    panoramaRows.attachPi(piBridge);
    piBridge.handle("window-opened", (msg) => {
        streamDeck.logger.info(`[pi] settings window ${msg.width}×${msg.height} at ${msg.scale}×`);
    });
    piBridge.handle("reconnect", () => reconnectBroker());
    piBridge.handle("ha-reconnect", () => reconnectHa());
    piBridge.handle("proxy-password", async (msg) => {
        await setProxyPassword(String(msg.value ?? ""));
        piBridge.schedulePush();
    });
    piBridge.handle("ha-attributes", async (msg) => {
        const e = ha.entities[String(msg.entityId ?? "")];
        await piBridge.reply(json({ event: "ha-attributes-result", requestId: msg.requestId as number, state: e?.state, attributes: haAttributes(e) }));
    });
    piBridge.handle("ha-entity-list", async (msg) => {
        const entities = Object.values(ha.entities).map((e) => ({ id: e.entity_id, name: haName(e) ?? "" }));
        entities.sort((a, b) => a.id.localeCompare(b.id));
        await piBridge.reply(json({ event: "ha-entity-list-result", requestId: msg.requestId as number, entities }));
    });
    piBridge.handle("ha-find", async (msg) => {
        const found = await findHomeAssistants();
        await piBridge.reply(json({ event: "ha-find-result", requestId: msg.requestId as number, found }));
    });
    piBridge.handle("topics", async (msg) => {
        const { hits, total } = searchTopics(String(msg.query ?? ""));
        await piBridge.reply(json({ event: "topics-result", requestId: msg.requestId as number, hits, total }));
    });
    piBridge.handle("topic-info", async (msg) => {
        const topic = String(msg.topic ?? "").trim();
        const payload = topic ? broker.value(topic)?.payload : undefined;
        const info = { topic, payload, fields: payload ? jsonFields(payload) : [], suggestion: topic ? withKnownAvailability(suggestForTopic(topic, payload)) : undefined };
        await piBridge.reply(json({ event: "topic-info-result", requestId: msg.requestId as number, info }));
    });
    initExplore();
    initHaDiscovery();
    initDevicePicker();
    piBridge.addPusher(() => [json({ event: "ha-status", status: haStatus() }), json({ event: "status", status: status() }), json({ event: "proxy-password-state", ...proxyPasswordState() })]);
    broker.onState(() => piBridge.schedulePush());
    ha.onState(() => piBridge.schedulePush());

    streamDeck.ui.onDidAppear(() => broker.subscribe("#", PI_OWNER));
    streamDeck.ui.onDidDisappear(() => broker.unsubscribe("#", PI_OWNER));
}

function status(): ConnectionStatus {
    return { state: broker.state, address: broker.address ? shortAddress(broker.address) : undefined, error: broker.lastError, topics: broker.topicCount };
}

/**
 * A scheme's availability topic only when something is there: zigbee2mqtt without availability for
 * a device has none, and a key would otherwise wait for a topic nobody writes to.
 */
function withKnownAvailability(s: TopicSuggestion | undefined): TopicSuggestion | undefined {
    if (!s?.availabilityTopic || broker.value(s.availabilityTopic) !== undefined) return s;
    return { ...s, availabilityTopic: undefined };
}

function haStatus(): HaStatus {
    return { state: ha.state, address: ha.address ? shortHaAddress(ha.address) : undefined, error: ha.lastError, version: ha.version, entities: ha.entityCount };
}

/** Topics containing every word of the query (case-insensitive), shortest first. */
export function searchTopics(query: string): { hits: TopicHit[]; total: number } {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all: TopicHit[] = [];
    for (const [topic, msg] of broker.topics()) {
        const t = topic.toLowerCase();
        if (words.every((w) => t.includes(w))) all.push({ topic, value: preview(msg.payload), retained: msg.retained });
    }
    all.sort((a, b) => a.topic.length - b.topic.length || a.topic.localeCompare(b.topic));
    return { hits: all.slice(0, MAX_HITS), total: all.length };
}

function preview(payload: string): string {
    const p = payload.replace(/\s+/g, " ").trim();
    return p.length > 80 ? `${p.slice(0, 79)}…` : p;
}

function json(msg: PiPush): PiPushMessage {
    return msg as unknown as PiPushMessage;
}

const COLOR_MODES = new Set(["hs", "rgb", "rgbw", "rgbww", "xy"]);

/** Lights with a colour mode, by name. */
function colorLights(): { value: string; label: string; sub: string }[] {
    return Object.values(ha.entities)
        .filter((e) => e.entity_id.startsWith("light.") && (e.attributes.supported_color_modes as string[] | undefined)?.some((m) => COLOR_MODES.has(m)))
        .map((e) => ({ value: e.entity_id, label: haName(e) ?? e.entity_id, sub: e.entity_id }))
        .sort((a, b) => a.label.localeCompare(b.label));
}
