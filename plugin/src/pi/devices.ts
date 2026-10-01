// The settings panel's device picker, over both sources: Home Assistant entities (by area, with
// their device) and the entities announced through MQTT discovery on the broker (by device). It
// answers the search with the ones that fit the action, and builds the settings for the one the
// user picks.
import { piBridge, type PiPushMessage } from "@rocklobster42195/streamdeck-kit/bridge";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { entities as mqttEntities } from "../discovery/ha-discovery";
import { fits, settingsFor, type ActionKind, type HaEntity } from "../discovery/ha-entities";
import { ha } from "../ha/connection";
import type { HaRegistry } from "../ha/ha-connection";
import { haFits, haName } from "../ha/entities";
import { haListIcon } from "../ha/icons";
import { broker } from "../mqtt/connection";
import type { DeviceItem, PiPush } from "./protocol";

const MAX_ITEMS = 80;

export function initDevicePicker(): void {
    piBridge.handle("devices", async (msg) => {
        const action = String(msg.action ?? "") as ActionKind;
        const words = String(msg.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
        const haAll = await haItems(action);
        const mqttAll = mqttEntities();
        const mqttFitting = mqttAll.filter((e) => fits(e).includes(action)).sort(byDevice).map(mqttItem);
        const matches = (it: DeviceItem) => words.every((w) => it.search.includes(w));
        const matching = [...haAll.filter(matches), ...mqttFitting.filter(matches)];
        const cur = msg.current as { source?: string; id?: string } | undefined;
        const current = cur?.id ? [...haAll, ...mqttFitting].find((it) => it.source === cur.source && it.id === cur.id) : undefined;
        await reply({
            event: "devices-result",
            requestId: msg.requestId as number,
            items: matching.slice(0, MAX_ITEMS),
            total: haAll.length + mqttFitting.length,
            matching: matching.length,
            current,
            sources: { ha: ha.state === "online", mqtt: broker.state !== "unconfigured" },
        });
    });

    piBridge.handle("device-apply", async (msg) => {
        const action = String(msg.action ?? "") as ActionKind;
        const id = String(msg.id ?? "");
        let settings: Record<string, unknown> | undefined;
        if (msg.source === "ha") {
            if (ha.entities[id] && haFits(id).includes(action)) settings = haSettings(id, action);
        } else {
            const e = mqttEntities().find((x) => x.id === id);
            if (e && fits(e).includes(action)) settings = { ...settingsFor(e, action), source: "mqtt", entityId: "" };
        }
        await reply({ event: "device-apply-result", requestId: msg.requestId as number, settings: settings as Record<string, never> | undefined });
    });
}

/** A Home Assistant entity on a key: name, icon and unit come from HA live, so they are cleared. */
function haSettings(entityId: string, action: ActionKind): Record<string, unknown> {
    const common = { source: "ha", entityId, haEntity: "", label: "" };
    if (action === "switch") return { ...common, iconOn: "", iconOff: "" };
    return action === "value" ? { ...common, icon: "", unit: "" } : { ...common, icon: "" };
}

async function haItems(action: ActionKind): Promise<DeviceItem[]> {
    if (ha.state !== "online") return [];
    let reg: HaRegistry;
    try {
        reg = await ha.registry();
    } catch {
        reg = { areas: [], devices: [], entities: [] };
    }
    const areas = new Map(reg.areas.map((a) => [a.area_id, a.name]));
    const devices = new Map(reg.devices.map((d) => [d.id, d]));
    const entries = new Map(reg.entities.map((e) => [e.entity_id, e]));
    const items: (DeviceItem & { sortArea: string; sortDevice: string })[] = [];
    for (const e of Object.values(ha.entities)) {
        if (!haFits(e.entity_id).includes(action)) continue;
        const entry = entries.get(e.entity_id);
        if (entry?.hidden_by || entry?.disabled_by) continue;
        const device = entry?.device_id ? devices.get(entry.device_id) : undefined;
        const area = areas.get(entry?.area_id ?? device?.area_id ?? "") ?? "";
        const deviceName = device?.name_by_user ?? device?.name ?? "";
        const name = haName(e) ?? e.entity_id;
        items.push({
            id: e.entity_id,
            source: "ha",
            name,
            group: area,
            sub: [deviceName && !name.startsWith(deviceName) ? deviceName : "", e.entity_id].filter(Boolean).join(" · "),
            extra: !!entry?.entity_category,
            icon: haListIcon(e),
            search: `${name} ${e.entity_id} ${deviceName} ${area}`.toLowerCase(),
            sortArea: area,
            sortDevice: deviceName,
        });
    }
    const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
    // Areas alphabetically, entities without an area last; then device, main entities first, name
    items.sort((a, b) => Number(!a.sortArea) - Number(!b.sortArea) || cmp(a.sortArea, b.sortArea) || cmp(a.sortDevice, b.sortDevice) || Number(a.extra) - Number(b.extra) || cmp(a.name, b.name));
    return items.map(({ sortArea: _a, sortDevice: _d, ...it }) => it);
}

/** Devices alphabetically; within one, the main entities before config/diagnostic ones. */
function byDevice(a: HaEntity, b: HaEntity): number {
    return (a.device ?? a.name).localeCompare(b.device ?? b.name, undefined, { numeric: true }) || Number(!!a.category) - Number(!!b.category) || a.name.localeCompare(b.name, undefined, { numeric: true });
}

function mqttItem(e: HaEntity): DeviceItem {
    return { id: e.id, source: "mqtt", name: e.name, group: e.device ?? "", sub: e.component, extra: !!e.category, icon: mdiPath(e.icon), search: `${e.name} ${e.device ?? ""} ${e.component}`.toLowerCase() };
}

function reply(msg: PiPush): Promise<void> {
    return piBridge.reply(msg as unknown as PiPushMessage);
}
