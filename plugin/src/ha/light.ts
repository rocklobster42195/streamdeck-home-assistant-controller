// What the light dial can do beyond brightness, from what the lamp reports: the levels of its settings
// mode (colour temperature, hue, saturation, effect), the calls that set them, and the preset (a
// snapshot of the lamp's state that a tap recalls and a long tap saves).
import type { HassEntity } from "home-assistant-js-websocket";
import { domainOf } from "./entities";

export type LightLevel = "kelvin" | "hue" | "saturation" | "effect";

export type HaCall = { domain: string; service: string; data: Record<string, unknown> };

/** The range, step and unit of a numeric level; `zones` colour the ring (value units, like the gauges'). */
export type LevelSpec = {
    min: number;
    max: number;
    step: number;
    unit: string;
    value?: number;
    zones: { from: number; color: string }[];
};

/** Colour modes that carry a hue and a saturation. */
const COLOR_MODES = new Set(["hs", "xy", "rgb", "rgbw", "rgbww"]);

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The lamp's effects in its own order. */
export function effectList(e: HassEntity | undefined): string[] {
    const list = e?.attributes.effect_list;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}

/** The effect that is running; undefined for none ("None", "off" are no effect). */
export function activeEffect(e: HassEntity | undefined): string | undefined {
    const effect = e?.attributes.effect;
    return typeof effect === "string" && effect !== "" && !/^(none|off)$/i.test(effect) ? effect : undefined;
}

/** The levels of the settings mode this lamp offers, in the order a push steps through them. */
export function lightLevels(e: HassEntity | undefined): LightLevel[] {
    if (!e || domainOf(e.entity_id) !== "light") return [];
    const modes = Array.isArray(e.attributes.supported_color_modes) ? (e.attributes.supported_color_modes as unknown[]) : [];
    const levels: LightLevel[] = [];
    if (modes.includes("color_temp")) levels.push("kelvin");
    if (modes.some((m) => typeof m === "string" && COLOR_MODES.has(m))) levels.push("hue", "saturation");
    if (effectList(e).length) levels.push("effect");
    return levels;
}

/** The lamp's hue and saturation, if it reports them. */
export function lightHs(e: HassEntity | undefined): [number, number] | undefined {
    const hs = e?.attributes.hs_color;
    return Array.isArray(hs) && num(hs[0]) !== undefined && num(hs[1]) !== undefined ? [hs[0] as number, hs[1] as number] : undefined;
}

// Warm to cold white, as the lamps show them
const KELVIN_COLORS: [number, string][] = [
    [0, "#ff8a12"],
    [2200, "#ffa84a"],
    [2700, "#ffc07d"],
    [3500, "#ffd7ae"],
    [4500, "#fff0df"],
    [5500, "#f4f6ff"],
    [6500, "#d3e2ff"],
];

const HUE_COLORS: [number, string][] = [
    [0, "#ff3b30"],
    [30, "#ff9500"],
    [60, "#ffd60a"],
    [120, "#30d158"],
    [180, "#40c8e0"],
    [240, "#0a84ff"],
    [300, "#bf5af2"],
];

/** The numeric level's range and current value; undefined for the effect level and levels the lamp lacks. */
export function levelSpec(e: HassEntity | undefined, level: LightLevel): LevelSpec | undefined {
    if (!e || !lightLevels(e).includes(level)) return undefined;
    const a = e.attributes;
    switch (level) {
        case "kelvin": {
            const min = num(a.min_color_temp_kelvin) ?? 2000;
            const max = num(a.max_color_temp_kelvin) ?? 6500;
            return { min, max: max > min ? max : min + 1, step: 100, unit: "K", value: num(a.color_temp_kelvin), zones: KELVIN_COLORS.map(([from, color]) => ({ from: from === 0 ? min : from, color })) };
        }
        case "hue":
            return { min: 0, max: 360, step: 5, unit: "°", value: lightHs(e)?.[0], zones: HUE_COLORS.map(([from, color]) => ({ from, color })) };
        case "saturation": {
            const hs = lightHs(e);
            return { min: 0, max: 100, step: 5, unit: "%", value: hs?.[1], zones: [{ from: 0, color: hueColor(hs?.[0] ?? 0) }] };
        }
        default:
            return undefined;
    }
}

/** The colour of a hue at full saturation, for the saturation ring. */
export function hueColor(hue: number): string {
    const h = (((hue % 360) + 360) % 360) / 60;
    const x = 1 - Math.abs((h % 2) - 1);
    const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
    return `#${[r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** The call that sets a numeric level; hue and saturation need the other half of the colour. */
export function levelCall(level: LightLevel, value: number, hs: [number, number] = [0, 100]): HaCall | undefined {
    const domain = "light";
    switch (level) {
        case "kelvin":
            return { domain, service: "turn_on", data: { color_temp_kelvin: Math.round(value) } };
        case "hue":
            return { domain, service: "turn_on", data: { hs_color: [Math.round(value), hs[1]] } };
        case "saturation":
            return { domain, service: "turn_on", data: { hs_color: [hs[0], Math.round(value)] } };
        default:
            return undefined;
    }
}

/** The call that starts an effect. */
export function effectCall(effect: string): HaCall {
    return { domain: "light", service: "turn_on", data: { effect } };
}

/** A lamp's state as a preset keeps it. */
export type LightSnapshot = {
    on: boolean;
    /** Percent. */
    brightness?: number;
    kelvin?: number;
    hs?: [number, number];
    effect?: string;
};

/** The lamp's state now; undefined for an entity that isn't a light. */
export function lightSnapshot(e: HassEntity | undefined): LightSnapshot | undefined {
    if (!e || domainOf(e.entity_id) !== "light") return undefined;
    if (e.state !== "on") return { on: false };
    const a = e.attributes;
    const b = num(a.brightness);
    const snap: LightSnapshot = { on: true };
    if (b !== undefined) snap.brightness = Math.max(1, Math.round((b / 255) * 100));
    // Only the colour the lamp shows now: its colour temperature or its colour
    const kelvin = num(a.color_temp_kelvin);
    const hs = lightHs(e);
    if (a.color_mode === "color_temp" && kelvin !== undefined) snap.kelvin = kelvin;
    else if (hs && a.color_mode !== "color_temp") snap.hs = hs;
    else if (kelvin !== undefined) snap.kelvin = kelvin;
    const effect = activeEffect(e);
    if (effect) snap.effect = effect;
    return snap;
}

/** Whether a stored value is a snapshot (settings come from a file and may be anything). */
export function isSnapshot(x: unknown): x is LightSnapshot {
    if (typeof x !== "object" || x === null) return false;
    const s = x as Record<string, unknown>;
    return typeof s.on === "boolean";
}

/** The call that puts the lamp back into a snapshot. */
export function snapshotCall(s: LightSnapshot): HaCall {
    if (!s.on) return { domain: "light", service: "turn_off", data: {} };
    const data: Record<string, unknown> = {};
    if (s.brightness !== undefined) data.brightness_pct = s.brightness;
    if (s.kelvin !== undefined) data.color_temp_kelvin = s.kelvin;
    else if (s.hs) data.hs_color = s.hs;
    if (s.effect) data.effect = s.effect;
    return { domain: "light", service: "turn_on", data };
}

/** The colour of white light at a colour temperature, between the warm and the cold ends of the scale. */
export function kelvinColor(kelvin: number): string {
    const stops = KELVIN_COLORS.slice(1);
    if (kelvin <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
        const [k1, c1] = stops[i];
        if (kelvin > k1) continue;
        const [k0, c0] = stops[i - 1];
        const t = (kelvin - k0) / (k1 - k0);
        const a = hexRgb(c0);
        const b = hexRgb(c1);
        return `#${a.map((v, j) => Math.round(v + (b[j] - v) * t).toString(16).padStart(2, "0")).join("")}`;
    }
    return stops[stops.length - 1][1];
}

function hexRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The colour the lamp shows now (at full brightness, the dial shows the brightness itself); undefined when off or when it has none. */
export function lightColor(e: HassEntity | undefined): string | undefined {
    if (!e || domainOf(e.entity_id) !== "light" || e.state !== "on") return undefined;
    const rgb = e.attributes.rgb_color;
    if (Array.isArray(rgb) && rgb.length >= 3 && rgb.slice(0, 3).every((c) => num(c) !== undefined)) {
        return `#${(rgb.slice(0, 3) as number[]).map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
    }
    const kelvin = num(e.attributes.color_temp_kelvin);
    return kelvin === undefined ? undefined : kelvinColor(kelvin);
}

/** A short line for the dial: the running effect, else the colour temperature while the lamp shows it. */
export function lightInfo(e: HassEntity | undefined): string | undefined {
    if (!e || domainOf(e.entity_id) !== "light" || e.state !== "on") return undefined;
    const effect = activeEffect(e);
    if (effect) return effect;
    const kelvin = num(e.attributes.color_temp_kelvin);
    return e.attributes.color_mode === "color_temp" && kelvin !== undefined ? `${Math.round(kelvin)} K` : undefined;
}
