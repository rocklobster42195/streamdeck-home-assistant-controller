// The Value key in three looks. "Text": the name at the top, the value large in its zone's colour,
// the unit below; with a second value, both on their own line; with an icon, the icon large at the
// top and two lines under it. "Gauge": the half circle with colour ranges and the value inside it,
// a second value at the bottom. "Open": the same on a ring open at the bottom (horseshoe), the
// value in the middle, min and max at the ends. Offline: dimmed with a cloud badge; before a value arrives: a dash. When a press
// switches something, the key looks like the Switch key: on = tinted plate, frame and icon in the
// colour; off = a grey icon.
import { escapeXml, halfArc, KEY_TIERS, keyActiveFrame, keyActivePlate, measureArialWidth, openRing, zoneColor, type Zones } from "@rocklobster42195/streamdeck-kit";
import { localNumber } from "../format";
import { mdiCloudOffOutline } from "@mdi/js";
import { BG, FONT, icon, SIZE, svgUri } from "./svg";

export type ValueKeyView = {
    look: "text" | "gauge" | "open";
    text?: string;
    number?: number;
    unit?: string;
    /** A second, smaller value under the first (already with its unit), e.g. the humidity. */
    second?: string;
    label?: string;
    /** MDI path shown small at the top left (text look) or under the value (gauge look). */
    icon?: string;
    zones: Zones;
    min: number;
    max: number;
    offline: boolean;
    /** What a press switches, in the Switch key's look; none when the press doesn't switch. */
    toggle?: { on: boolean; color: string };
    /** The icon takes the colour of the value's range (the value's own colour). */
    iconInRangeColor?: boolean;
};

const DIM = "#7a7a80";

export function renderValueKey(v: ValueKeyView): string {
    const color = v.offline ? DIM : v.number !== undefined ? zoneColor(v.number, v.zones) : v.zones[0].color;
    const on = v.toggle?.on === true && !v.offline;
    const parts = [`<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>`];
    if (on) parts.push(keyActivePlate(v.toggle!.color));
    if (v.look === "gauge") parts.push(...gauge(v, color));
    else if (v.look === "open") parts.push(...horseshoe(v, color));
    else parts.push(...textLook(v, color));
    if (on) parts.push(keyActiveFrame(v.toggle!.color));
    // Text look: the name sits at the top, so the badge goes bottom right; gauge: the free top corner
    if (v.offline) parts.push(v.look !== "text" ? icon(mdiCloudOffOutline, SIZE - 28, 4, 24, "#ff6b6b") : icon(mdiCloudOffOutline, SIZE - 32, SIZE - 32, 26, "#ff6b6b"));
    return svgUri(parts);
}

function textLook(v: ValueKeyView, color: string): string[] {
    if (v.icon) return iconLook(v, color);
    const parts: string[] = [];
    const label = v.label?.trim();
    if (label) {
        const size = fit(label, 18, SIZE - 16, true, 12);
        parts.push(text(clip(label, size, SIZE - 16, true), SIZE / 2, 30, size, "#c8c8cc", 600));
    }
    const value = v.text ?? "–";
    const unit = v.unit?.trim();
    const second = v.second?.trim();
    if (second) {
        // Two values: the first with its unit on one line, the second smaller below
        const first = `${value}${unit ? ` ${unit}` : ""}`;
        parts.push(text(first, SIZE / 2, 86, fit(first, 38, SIZE - 12, true, 16), color, 700));
        parts.push(text(second, SIZE / 2, 122, fit(second, 26, SIZE - 16, true, 12), v.offline ? DIM : "#c8c8cc", 600));
        return parts;
    }
    const size = fit(value, 48, SIZE - 12, true, 18);
    const y = unit ? 92 : 100;
    parts.push(text(value, SIZE / 2, y, size, color, 700));
    if (unit) parts.push(text(unit, SIZE / 2, 124, fit(unit, 20, SIZE - 16, false, 12), v.offline ? DIM : "#c8c8cc", 400));
    return parts;
}

/**
 * Text look with an icon: the icon large at the top, two lines under it (as other Stream Deck HA
 * plugins do): the value and the second value, or the name and the value, or the value alone.
 */
function iconLook(v: ValueKeyView, color: string): string[] {
    const soft = v.offline ? DIM : "#c8c8cc";
    const parts = [icon(v.icon!, 40, 6, 64, iconInk(v, "#e8e8ec", color))];
    const unit = v.unit?.trim();
    const first = `${v.text ?? "–"}${unit ? ` ${unit}` : ""}`;
    const second = v.second?.trim();
    const label = v.label?.trim();
    const line = (s: string, y: number, max: number, min: number, fill: string, weight: number) => {
        const size = fit(s, max, SIZE - 12, true, min);
        parts.push(text(clip(s, size, SIZE - 12, true), SIZE / 2, y, size, fill, weight));
    };
    if (second) {
        line(first, 100, 28, 14, color, 700);
        line(second, 130, 22, 12, soft, 600);
    } else if (label) {
        line(label, 98, 20, 12, soft, 600);
        line(first, 130, 26, 14, color, 700);
    } else line(first, 116, 34, 14, color, 700);
    return parts;
}

function gauge(v: ValueKeyView, color: string): string[] {
    const cx = SIZE / 2;
    const cy = 96;
    const parts = halfArc({ cx, cy, r: 54, width: 12, min: v.min, max: v.max, value: v.offline ? undefined : v.number, zones: v.zones, zoneOpacity: v.offline ? 0.15 : 0.35 });
    const value = v.text ?? "–";
    const unit = v.unit?.trim();
    // Value inside the arc, the unit after it a little smaller
    const vs = fit(`${value}${unit ? ` ${unit}` : ""}`, 30, 84, true, 14);
    const us = Math.round(vs * 0.6);
    const vw = measureArialWidth(value, vs, true);
    const uw = unit ? measureArialWidth(` ${unit}`, us) : 0;
    const x0 = cx - (vw + uw) / 2;
    parts.push(`<text x="${x0.toFixed(1)}" y="${cy - 6}" ${FONT} font-size="${vs}" font-weight="700" fill="${color}">${escapeXml(value)}${unit ? `<tspan font-size="${us}" font-weight="400" fill="${v.offline ? DIM : "#c8c8cc"}"> ${escapeXml(unit)}</tspan>` : ""}</text>`);
    // Min and max under the ends, the name at the bottom
    parts.push(text(short(v.min), cx - 54, cy + 18, 12, DIM, 400), text(short(v.max), cx + 54, cy + 18, 12, DIM, 400));
    // At the bottom: the second value, else the name, else the icon
    const label = v.second?.trim() || v.label?.trim();
    if (label) {
        const size = fit(label, 17, SIZE - 50, true, 11);
        parts.push(text(clip(label, size, SIZE - 50, true), cx, 132, size, v.offline ? DIM : "#c8c8cc", 600));
    }
    else if (v.icon) parts.push(icon(v.icon, cx - 12, 112, 24, iconInk(v, "#c8c8cc", color)));
    return parts;
}

/**
 * The icon's colour: the value's range colour when asked for; else as the Switch key's while a
 * press switches something (on: its colour, off: grey); else `plain`.
 */
function iconInk(v: ValueKeyView, plain: string, rangeColor: string): string {
    if (v.offline) return DIM;
    if (v.iconInRangeColor) return rangeColor;
    if (!v.toggle) return plain;
    return v.toggle.on ? v.toggle.color : KEY_TIERS.off;
}

/** The horseshoe: the ring with the colour ranges as bands, the value inside, min and max at the ends. */
function horseshoe(v: ValueKeyView, color: string): string[] {
    const cx = SIZE / 2;
    const cy = 68;
    const parts = openRing({ cx, cy, r: 52, width: 11, min: v.min, max: v.max, value: v.offline ? undefined : v.number, zones: v.zones, zoneOpacity: v.offline ? 0.15 : 0.35 });
    const value = v.text ?? "–";
    const unit = v.unit?.trim();
    // Value in the middle, the unit under it
    parts.push(text(value, cx, unit ? cy + 6 : cy + 11, fit(value, 32, 80, true, 14), color, 700));
    if (unit) parts.push(text(unit, cx, cy + 26, fit(unit, 15, 70, false, 10), v.offline ? DIM : "#c8c8cc", 400));
    // Min and max under the ring's ends
    parts.push(text(short(v.min), cx - 37, 124, 12, DIM, 400), text(short(v.max), cx + 37, 124, 12, DIM, 400));
    // In the opening: the second value, else the name, else the icon
    const label = v.second?.trim() || v.label?.trim();
    if (label) {
        const size = fit(label, 16, 60, true, 10);
        parts.push(text(clip(label, size, 60, true), cx, 136, size, v.offline ? DIM : "#c8c8cc", 600));
    } else if (v.icon) parts.push(icon(v.icon, cx - 12, 112, 24, iconInk(v, "#c8c8cc", color)));
    return parts;
}

function text(s: string, x: number, y: number, size: number, color: string, weight: number): string {
    return `<text x="${x.toFixed(1)}" y="${y}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="middle">${escapeXml(s)}</text>`;
}

/** `s` cut to fit `width` at `size`, ending in "…" when it had to be cut. */
function clip(s: string, size: number, width: number, bold: boolean): string {
    if (measureArialWidth(s, size, bold) <= width) return s;
    let cut = s;
    while (cut.length > 1 && measureArialWidth(`${cut}…`, size, bold) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
}

/** The largest font size up to `max` at which `s` fits `width` (not below `min`). */
function fit(s: string, max: number, width: number, bold: boolean, min: number): number {
    let size = max;
    while (size > min && measureArialWidth(s, size, bold) > width) size--;
    return size;
}

function short(n: number): string {
    return Number.isInteger(n) ? String(n) : localNumber(n.toFixed(1));
}
