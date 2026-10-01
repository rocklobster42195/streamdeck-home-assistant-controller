// The Value key in two looks. "Text": the name at the top, the value large in its zone's colour,
// the unit below; with a second value, both on their own line. "Gauge": the half circle with colour
// ranges and the value inside it, a second value at the bottom. Offline:
// dimmed with a cloud badge; before a value arrives: a dash. A frame shows that what a press
// switches is on.
import { escapeXml, halfArc, measureArialWidth, zoneColor, type Zones } from "@rocklobster42195/streamdeck-kit";
import { mdiCloudOffOutline } from "@mdi/js";
import { BG, FONT, icon, SIZE, svgUri } from "./svg";

export type ValueKeyView = {
    look: "text" | "gauge";
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
    /** Colour of a frame around the key (what a press switches is on); none when undefined. */
    frame?: string;
};

const DIM = "#7a7a80";

export function renderValueKey(v: ValueKeyView): string {
    const color = v.offline ? DIM : v.number !== undefined ? zoneColor(v.number, v.zones) : v.zones[0].color;
    const parts = [`<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>`];
    if (v.frame) parts.push(`<rect x="3" y="3" width="${SIZE - 6}" height="${SIZE - 6}" rx="14" fill="none" stroke="${v.frame}" stroke-width="5"${v.offline ? ' opacity="0.35"' : ""}/>`);
    if (v.look === "gauge") parts.push(...gauge(v, color));
    else parts.push(...textLook(v, color));
    // Text look: the name sits at the top, so the badge goes bottom right; gauge: the free top corner
    if (v.offline) parts.push(v.look === "gauge" ? icon(mdiCloudOffOutline, SIZE - 28, 4, 24, "#ff6b6b") : icon(mdiCloudOffOutline, SIZE - 32, SIZE - 32, 26, "#ff6b6b"));
    return svgUri(parts);
}

function textLook(v: ValueKeyView, color: string): string[] {
    const parts: string[] = [];
    const label = v.label?.trim();
    if (v.icon) parts.push(icon(v.icon, 10, 10, 26, v.offline ? DIM : "#c8c8cc"));
    if (label) parts.push(text(label, v.icon ? 40 + (SIZE - 50) / 2 : SIZE / 2, 30, fit(label, 18, v.icon ? SIZE - 50 : SIZE - 16, true, 12), "#c8c8cc", 600));
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
    if (label) parts.push(text(label, cx, 132, fit(label, 17, SIZE - 50, true, 11), v.offline ? DIM : "#c8c8cc", 600));
    else if (v.icon) parts.push(icon(v.icon, cx - 12, 112, 24, v.offline ? DIM : "#c8c8cc"));
    return parts;
}

function text(s: string, x: number, y: number, size: number, color: string, weight: number): string {
    return `<text x="${x.toFixed(1)}" y="${y}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="middle">${escapeXml(s)}</text>`;
}

/** The largest font size up to `max` at which `s` fits `width` (not below `min`). */
function fit(s: string, max: number, width: number, bold: boolean, min: number): number {
    let size = max;
    while (size > min && measureArialWidth(s, size, bold) > width) size--;
    return size;
}

function short(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
