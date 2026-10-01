// Home Assistant discovery on the broker: HA-C listens to the (retained) config topics from the
// start, and answers the settings panel's device picker: the entities that fit an action, grouped
// by device, and the settings for the one the user picks.
import { piBridge, type PiPushMessage } from "@rocklobster42195/streamdeck-kit/bridge";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { broker } from "../mqtt/connection";
import type { HaItem, PiPush } from "../pi/protocol";
import { fits, parseDiscovery, settingsFor, type ActionKind, type HaEntity } from "./ha-entities";

const PREFIX = "homeassistant";
const CONFIG = /^homeassistant\/[^/]+\/(?:[^/]+\/)?[^/]+\/config$/;
const OWNER = "ha-discovery";
const MAX_ITEMS = 80;

export function initHaDiscovery(): void {
    broker.subscribe(`${PREFIX}/+/+/config`, OWNER);
    broker.subscribe(`${PREFIX}/+/+/+/config`, OWNER);

    piBridge.handle("ha-entities", async (msg) => {
        const action = String(msg.action ?? "") as ActionKind;
        const all = entities();
        const words = String(msg.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
        const matching = all.filter((e) => fits(e).includes(action) && words.every((w) => `${e.name} ${e.device ?? ""} ${e.component}`.toLowerCase().includes(w)));
        const items = matching.sort(order).slice(0, MAX_ITEMS).map(item);
        await reply({ event: "ha-entities-result", requestId: msg.requestId as number, items, total: all.length, matching: matching.length, current: currentItem(all, String(msg.current ?? "")) });
    });

    piBridge.handle("ha-apply", async (msg) => {
        const e = entities().find((x) => x.id === msg.id);
        const action = String(msg.action ?? "") as ActionKind;
        await reply({ event: "ha-apply-result", requestId: msg.requestId as number, settings: e && fits(e).includes(action) ? (settingsFor(e, action) as Record<string, never>) : undefined });
    });
}

/** Every entity announced on the broker right now. */
export function entities(): HaEntity[] {
    const out: HaEntity[] = [];
    for (const [topic, msg] of broker.topics()) {
        if (!CONFIG.test(topic)) continue;
        const e = parseDiscovery(topic, msg.payload);
        if (e) out.push(e);
    }
    return out;
}

/** Devices alphabetically; within one, the main entities before config/diagnostic ones. */
function order(a: HaEntity, b: HaEntity): number {
    return (a.device ?? a.name).localeCompare(b.device ?? b.name, undefined, { numeric: true }) || Number(!!a.category) - Number(!!b.category) || a.name.localeCompare(b.name, undefined, { numeric: true });
}

function item(e: HaEntity): HaItem {
    return { id: e.id, name: e.name, device: e.device, component: e.component, extra: !!e.category, icon: mdiPath(e.icon) };
}

function currentItem(all: HaEntity[], id: string): HaItem | undefined {
    const e = id ? all.find((x) => x.id === id) : undefined;
    return e ? item(e) : undefined;
}

function reply(msg: PiPush): Promise<void> {
    return piBridge.reply(msg as unknown as PiPushMessage);
}
