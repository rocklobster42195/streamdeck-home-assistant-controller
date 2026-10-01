// HAC's part of the kit's PI bridge: the status of both connections, the search for Home
// Assistant on the network, the topic search for the topic fields,
// and what HAC knows about one topic (its payload, JSON fields, a scheme suggestion). While a
// settings panel is open, HAC listens to every topic ("#"), so the search sees the whole broker.
import streamDeck from "@elgato/streamdeck";
import { piBridge, type PiPushMessage } from "@rocklobster42195/streamdeck-kit/bridge";
import { mdiOptions } from "@rocklobster42195/streamdeck-kit/mdi";
import { reconnectBroker, reconnectHa } from "../connections";
import { ha } from "../ha/connection";
import { shortHaAddress } from "../ha/url";
import { findHomeAssistants } from "../ha/zeroconf";
import { broker } from "../mqtt/connection";
import { jsonFields } from "../mqtt/payload";
import { suggestForTopic } from "../mqtt/schemes";
import { shortAddress } from "../mqtt/url";
import { initHaDiscovery } from "../discovery/ha-discovery";
import { initDevicePicker } from "./devices";
import { initExplore } from "./explore";
import type { ConnectionStatus, HaStatus, PiPush, TopicHit } from "./protocol";

const PI_OWNER = "settings-panel";
const MAX_HITS = 40;

export function initPiBridge(): void {
    piBridge.init();
    piBridge.registerOptions("mdi-icons", mdiOptions);
    piBridge.handle("reconnect", () => reconnectBroker());
    piBridge.handle("ha-reconnect", () => reconnectHa());
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
        const info = { topic, payload, fields: payload ? jsonFields(payload) : [], suggestion: topic ? suggestForTopic(topic, payload) : undefined };
        await piBridge.reply(json({ event: "topic-info-result", requestId: msg.requestId as number, info }));
    });
    initExplore();
    initHaDiscovery();
    initDevicePicker();
    piBridge.addPusher(() => [json({ event: "ha-status", status: haStatus() }), json({ event: "status", status: status() })]);
    broker.onState(() => piBridge.schedulePush());
    ha.onState(() => piBridge.schedulePush());

    streamDeck.ui.onDidAppear(() => broker.subscribe("#", PI_OWNER));
    streamDeck.ui.onDidDisappear(() => broker.unsubscribe("#", PI_OWNER));
}

function status(): ConnectionStatus {
    return { state: broker.state, address: broker.address ? shortAddress(broker.address) : undefined, error: broker.lastError, topics: broker.topicCount };
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
