// Home Assistant entities on HA-C's keys, without Stream Deck: which domains fit which action, what
// an entity's state means for the Switch key (on, off, unknown) and which service switches it, which
// service the Trigger key calls, how the Multi-state key picks an option, what the Value key shows,
// and the icon HA would use.
import type { HassEntity } from "home-assistant-js-websocket";
import { mdiName } from "../discovery/ha-config";
import type { ActionKind } from "../discovery/ha-entities";
import type { SwitchState } from "../mqtt/switch-state";
import { dimmable } from "./dial";

/** Per domain: the state that counts as "on" and the services for on and off. */
const SWITCHABLE: Record<string, { on: string; turnOn: string; turnOff: string }> = {
    light: { on: "on", turnOn: "turn_on", turnOff: "turn_off" },
    switch: { on: "on", turnOn: "turn_on", turnOff: "turn_off" },
    input_boolean: { on: "on", turnOn: "turn_on", turnOff: "turn_off" },
    fan: { on: "on", turnOn: "turn_on", turnOff: "turn_off" },
    siren: { on: "on", turnOn: "turn_on", turnOff: "turn_off" },
    humidifier: { on: "on", turnOn: "turn_on", turnOff: "turn_off" },
    lock: { on: "locked", turnOn: "lock", turnOff: "unlock" },
    cover: { on: "open", turnOn: "open_cover", turnOff: "close_cover" },
};

/** The "off" states per domain (anything else but "on" and these is unknown). */
const OFF: Record<string, string[]> = { lock: ["unlocked"], cover: ["closed"] };

/** Domains with a list of options (the Multi-state key steps through them with select_option). */
const SELECTABLE = new Set(["select", "input_select"]);

/** Per domain: the service that runs it once (the Trigger key). */
const TRIGGERABLE: Record<string, string> = { scene: "turn_on", script: "turn_on", button: "press", input_button: "press", automation: "trigger" };

const VALUE_DOMAINS = new Set(["sensor", "binary_sensor", "number", "input_number", "counter", "input_text", "input_select", "select", "weather", "sun"]);

/** States meaning HA can't reach the device. */
const UNAVAILABLE = new Set(["unavailable"]);

export function domainOf(entityId: string): string {
    return entityId.split(".")[0];
}

/** Domains the Slider dial turns (see dial.ts); lights only when they can dim. */
const DIALS = new Set(["light", "fan", "cover", "climate", "number", "input_number"]);

/** The actions an entity fits, the best one first; `e` lets lights without brightness skip the dial. */
export function haFits(entityId: string, e?: HassEntity): ActionKind[] {
    const d = domainOf(entityId);
    const dial = DIALS.has(d) && !(d === "light" && e && !dimmable(e));
    if (SWITCHABLE[d]) return dial ? ["switch", "slider"] : ["switch"];
    if (d === "climate") return ["slider"];
    if (d === "number" || d === "input_number") return ["slider", "value"];
    if (TRIGGERABLE[d]) return ["publish"];
    if (SELECTABLE.has(d)) return ["multi-state", "value"];
    if (VALUE_DOMAINS.has(d)) return ["value"];
    return [];
}

export function isUnavailable(e: HassEntity | undefined): boolean {
    return !e || UNAVAILABLE.has(e.state);
}

export function haSwitchState(e: HassEntity | undefined): SwitchState {
    if (!e) return "unknown";
    const d = domainOf(e.entity_id);
    const sw = SWITCHABLE[d];
    if (!sw) return "unknown";
    if (e.state === sw.on) return "on";
    if (e.state === "off" || OFF[d]?.includes(e.state)) return "off";
    return "unknown";
}

/** The service that switches the entity on or off; undefined for domains HA-C can't switch. */
export function haSwitchService(entityId: string, turnOn: boolean): { domain: string; service: string } | undefined {
    const domain = domainOf(entityId);
    const sw = SWITCHABLE[domain];
    return sw ? { domain, service: turnOn ? sw.turnOn : sw.turnOff } : undefined;
}

/** A select's options (its "options" attribute), in HA's order. */
export function haOptions(e: HassEntity | undefined): string[] {
    const o = e?.attributes.options;
    return Array.isArray(o) ? o.filter((x): x is string => typeof x === "string") : [];
}

/** The service that picks one option of a select; undefined for other domains. */
export function haSelectService(entityId: string, option: string): { domain: string; service: string; data: { option: string } } | undefined {
    const domain = domainOf(entityId);
    return SELECTABLE.has(domain) ? { domain, service: "select_option", data: { option } } : undefined;
}

/** The service that runs a scene, script, button or automation once; undefined for other domains. */
export function haTriggerService(entityId: string): { domain: string; service: string } | undefined {
    const domain = domainOf(entityId);
    return TRIGGERABLE[domain] ? { domain, service: TRIGGERABLE[domain] } : undefined;
}

/**
 * The state, or one of the entity's attributes, as text with its unit. A light's brightness
 * (0–255) reads as percent; lists and objects are left out.
 */
export function haRead(e: HassEntity | undefined, attribute?: string): { payload?: string; unit?: string } {
    if (!e || UNAVAILABLE.has(e.state)) return {};
    const attr = attribute?.trim();
    if (!attr) {
        if (e.state === "unknown") return {};
        const unit = e.attributes.unit_of_measurement;
        return { payload: e.state, unit: typeof unit === "string" ? unit : undefined };
    }
    const v = e.attributes[attr];
    if (attr === "brightness" && typeof v === "number") return { payload: String(Math.round((v / 255) * 100)), unit: "%" };
    if (v === null || v === undefined || typeof v === "object") return {};
    return { payload: String(v) };
}

/** The attributes the Value key can show (scalars only), with their current values. */
export function haAttributes(e: HassEntity | undefined): { name: string; value: string }[] {
    if (!e) return [];
    return Object.entries(e.attributes)
        .filter(([name, v]) => v !== null && v !== undefined && typeof v !== "object" && !HIDDEN_ATTRIBUTES.has(name))
        .map(([name, v]) => ({ name, value: String(v) }));
}

/** Attributes that describe the entity rather than measure something. */
const HIDDEN_ATTRIBUTES = new Set(["friendly_name", "icon", "entity_picture", "unit_of_measurement", "device_class", "state_class", "supported_features", "supported_color_modes", "color_mode", "attribution", "restored", "editable", "id", "assumed_state"]);

export function haName(e: HassEntity | undefined): string | undefined {
    const n = e?.attributes.friendly_name;
    return typeof n === "string" && n.trim() ? n : undefined;
}

/** The entity's own icon ("mdi:lamp" → "mdiLamp"), if HA has one set. */
export function haIcon(e: HassEntity | undefined): string | undefined {
    return mdiName(e?.attributes.icon);
}
