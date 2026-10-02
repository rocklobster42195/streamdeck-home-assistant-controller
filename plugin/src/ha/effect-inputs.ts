// What the Panorama effect behind a Slider dial takes from Home Assistant: a colour from any entity
// (a light's colour, a text helper's "#FF8800", "255,136,0" or "rot", or an attribute), and numbers
// for speed and density (a number helper brings its own min and max). The kit turns them into the
// effect's settings (parseColor, scaleToEffect); they win over picked settings in the whole group.
import { parseColor, scaleToEffect } from "@rocklobster42195/streamdeck-kit";
import type { HassEntity } from "home-assistant-js-websocket";

/** Typed into the colour field: no colour from HA at all (not even the dial's own light). */
const NO_COLOR = new Set(["none", "keine", "-"]);

/** The colour field says "no colour from HA". */
export function noEffectColor(entityId: string | undefined): boolean {
    return NO_COLOR.has(entityId?.trim().toLowerCase() ?? "");
}

/**
 * The colour an entity stands for: the attribute when one is given; a light's rgb_color (or
 * hs_color); otherwise the state. Undefined when it isn't a colour (e.g. a light that is off).
 */
export function haEffectColor(e: HassEntity | undefined, attribute?: string): string | undefined {
    if (!e) return undefined;
    const attr = attribute?.trim();
    if (attr) return parseColor(e.attributes[attr]);
    const rgb = e.attributes.rgb_color;
    if (Array.isArray(rgb)) return parseColor(rgb);
    const hs = e.attributes.hs_color;
    if (Array.isArray(hs) && hs.length >= 2) return parseColor({ h: hs[0], s: hs[1] });
    return parseColor(e.state);
}

/**
 * An entity's number mapped onto one setting of the effect (savedSpeed, savedDensity). The range is
 * the one given, else the helper's own min/max, else 0–100.
 */
export function haEffectNumber(e: HassEntity | undefined, effectId: string, key: string, min?: string, max?: string): number | undefined {
    const value = Number(e?.state);
    if (!e || !Number.isFinite(value)) return undefined;
    const lo = numberOr(min, e.attributes.min, 0);
    const hi = numberOr(max, e.attributes.max, 100);
    return scaleToEffect(effectId, key, value, lo, hi);
}

function numberOr(setting: string | undefined, attribute: unknown, fallback: number): number {
    const s = setting?.trim() ? Number(setting.replace(",", ".")) : NaN;
    if (Number.isFinite(s)) return s;
    const a = Number(attribute);
    return attribute !== undefined && Number.isFinite(a) ? a : fallback;
}
