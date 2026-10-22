// The Slider dial's display (200×100). "Half": a half circle with the colour ranges, the value
// inside it; with an actual value, the arc shows the actual value and a marker the setpoint
// (thermostat), and the setpoint is written small under the value. "Ring": MA-C's ring on the
// left, the name and value on the right. "Pie": Sonos Controller's pie in the same place. "Open"
// (the default, as Home Assistant's cards): the kit's ring open at the bottom with a handle on the
// value, text inside; with an actual value a thermostat (dot at the room temperature, which is also
// written in the gap). Off (what a push switches is
// off): dimmed with "Off". Offline: dimmed with a cloud badge.
import { arc, dialOfflineBadge, escapeXml, halfArc, halfArcPosition, measureArialWidth, mdi, openRing, pie, scrimDisc, scrimText, stripImage, text, zoneColor, type Zones } from "@rocklobster42195/streamdeck-kit";
import { localNumber } from "../format";

export type SliderView = {
    look: "open" | "half" | "ring" | "pie";
    /** The value the dial sets; undefined before anything arrived. */
    setpoint?: number;
    setpointText?: string;
    /** The measured value (thermostat), if there is one. */
    actual?: number;
    actualText?: string;
    unit?: string;
    label?: string;
    icon?: string;
    min: number;
    max: number;
    /** Texts at the ends of the arc (e.g. "0" and "100" when shown in percent). */
    rangeLabels?: [string, string];
    zones: Zones;
    /** What a push switches is off. */
    off: boolean;
    /** A short state in the corner, e.g. a thermostat's mode ("Heizen"). */
    status?: string;
    offText: string;
    offline: boolean;
    /** The Panorama effect's slice behind the dial (SVG fragment), if it shows one. */
    background?: string;
    /** The user is turning the dial: the setpoint is drawn highlighted. */
    adjusting: boolean;
};

const DIM = "#6a6a70";
const SOFT = "#c8c8cc";

/** Not set up yet (no broker, no topic): an icon and a short text. */
export function renderSliderMessage(icon: string, line: string, warn: boolean): string {
    return stripImage([mdi(icon, 20, 30, 40, warn ? "#ff6b6b" : DIM), text(72, 56, line, { size: 16, color: SOFT, maxWidth: 122 })]);
}

export function renderSliderDial(v: SliderView): string {
    const parts = v.look === "ring" ? ring(v) : v.look === "pie" ? pieLook(v) : v.look === "half" ? half(v) : open(v);
    if (v.offline) parts.push(dialOfflineBadge());
    return stripImage(parts, undefined, v.background);
}

/** The number the gauge fills to, and the big text. */
function shown(v: SliderView): { fill?: number; big: string; small?: string } {
    const unit = v.unit?.trim();
    const withUnit = (t: string | undefined) => (t === undefined ? "–" : unit ? `${t} ${unit}` : t);
    if (v.actual !== undefined && !v.adjusting) return { fill: v.actual, big: withUnit(v.actualText), small: v.setpointText !== undefined ? `→ ${withUnit(v.setpointText)}` : undefined };
    return { fill: v.actual ?? v.setpoint, big: withUnit(v.setpointText), small: v.actual !== undefined ? withUnit(v.actualText) : undefined };
}

function half(v: SliderView): string[] {
    const dim = v.offline || v.off;
    const s = shown(v);
    // The arc's ends sit a little above the bottom, so the range labels under them stay readable
    const cx = 100;
    const cy = 78;
    const r = 60;
    const color = dim ? DIM : s.fill !== undefined ? zoneColor(s.fill, v.zones) : SOFT;
    const parts = halfArc({
        cx,
        cy,
        r,
        width: 10,
        min: v.min,
        max: v.max,
        value: dim ? undefined : s.fill,
        target: v.actual !== undefined && !dim ? v.setpoint : undefined,
        zones: v.zones,
        zoneOpacity: dim ? 0.15 : 0.35,
        marker: v.adjusting ? "#ffffff" : "#e8e8ec",
    });
    const big = v.off ? v.offText : s.big;
    // Over an effect: dark behind the arc and each text, the effect stays visible around them
    if (v.background) {
        parts.unshift(
            scrimDisc(cx, cy, r + 8),
            v.label?.trim() ? scrimText(4, 14, v.label.trim(), 13, { maxWidth: 66 }) : "",
            v.status ? scrimText(196, 14, v.status, 12, { anchor: "end", maxWidth: 66 }) : "",
        );
    }
    parts.push(text(cx, cy - 12, big, { size: fitSize(big, 30, 92, 16), color, weight: "bold", anchor: "middle" }));
    if (s.small && !v.off) parts.push(text(cx, cy + 6, s.small, { size: 14, color: v.adjusting ? "#ffffff" : SOFT, anchor: "middle", maxWidth: 110 }));
    if (v.label?.trim()) parts.push(text(4, 14, v.label.trim(), { size: 13, color: dim ? DIM : SOFT, maxWidth: 66 }));
    else if (v.icon) parts.push(mdi(v.icon, 4, 2, 20, dim ? DIM : SOFT));
    if (v.status) parts.push(text(196, 14, v.status, { size: 12, color: dim ? DIM : SOFT, anchor: "end", maxWidth: 66 }));
    // Range at the ends of the arc (on a little box over an effect)
    const lo = v.rangeLabels?.[0] ?? short(v.min);
    const hi = v.rangeLabels?.[1] ?? short(v.max);
    if (v.background) parts.push(scrimText(cx - r, 96, lo, 11, { anchor: "middle" }), scrimText(cx + r, 96, hi, 11, { anchor: "middle" }));
    parts.push(text(cx - r, 96, lo, { size: 11, color: DIM, anchor: "middle" }), text(cx + r, 96, hi, { size: 11, color: DIM, anchor: "middle" }));
    return parts;
}

function ring(v: SliderView): string[] {
    const dim = v.offline || v.off;
    const s = shown(v);
    const color = dim ? DIM : s.fill !== undefined ? zoneColor(s.fill, v.zones) : SOFT;
    const pos = s.fill !== undefined ? halfArcPosition(s.fill, v.min, v.max) : 0;
    const parts = [...rightColumnScrims(v, s), ...arc(46, 50, 34, dim ? 0 : pos, color, { width: 8 })];
    if (v.icon) parts.push(mdi(v.icon, 32, 36, 28, dim ? DIM : SOFT));
    else parts.push(text(46, 56, `${Math.round(pos * 100)}%`, { size: 15, color: dim ? DIM : "#ffffff", weight: "bold", anchor: "middle" }));
    const x = 92;
    if (v.status) parts.push(text(x, 13, v.status, { size: 11, color: dim ? DIM : SOFT, maxWidth: 104 }));
    if (v.label?.trim()) parts.push(text(x, 30, v.label.trim(), { size: 14, color: dim ? DIM : SOFT, maxWidth: 104 }));
    const big = v.off ? v.offText : s.big;
    parts.push(text(x, 62, big, { size: fitSize(big, 26, 104, 14), color, weight: "bold" }));
    if (s.small && !v.off) parts.push(text(x, 84, s.small, { size: 13, color: v.adjusting ? "#ffffff" : SOFT, maxWidth: 104 }));
    return parts;
}

/** Ring and pie over an effect: dark behind the circle and each line of the text column. */
function rightColumnScrims(v: SliderView, s: ReturnType<typeof shown>): string[] {
    if (!v.background) return [];
    const x = 92;
    const big = v.off ? v.offText : s.big;
    return [
        scrimDisc(46, 50, 44),
        v.status ? scrimText(x, 13, v.status, 11, { maxWidth: 104 }) : "",
        v.label?.trim() ? scrimText(x, 30, v.label.trim(), 14, { maxWidth: 104 }) : "",
        scrimText(x, 62, big, fitSize(big, 26, 104, 14), { bold: true, maxWidth: 104 }),
        s.small && !v.off ? scrimText(x, 84, s.small, 13, { maxWidth: 104 }) : "",
    ];
}

/** The open ring's place: in the middle of the strip, text inside. */
const RING = { cx: 100, cy: 50, r: 40 };

/** "21,5" with the whole number large, the decimals small and the unit raised (as HA writes it). */
function bigNumber(value: string, unit: string | undefined, y: number, color: string): string {
    const m = /^(-?\d+)([.,]\d+)?$/.exec(value);
    if (!m) return text(RING.cx, y, value, { size: fitSize(value, 22, 64, 12), color, weight: "bold", anchor: "middle" });
    const whole = `<tspan font-size="26">${escapeXml(m[1])}</tspan>`;
    const dec = m[2] ? `<tspan font-size="14">${escapeXml(m[2])}</tspan>` : "";
    const u = unit ? `<tspan font-size="11" font-weight="normal" dy="-12">${escapeXml(unit)}</tspan>` : "";
    return `<text x="${RING.cx}" y="${y}" font-family="Arial,sans-serif" font-weight="bold" fill="${color}" text-anchor="middle">${whole}${dec}${u}</text>`;
}

/**
 * The open ring (HA's style). With an actual value it is a thermostat: the ring fills up to the
 * setpoint with a handle on it, a dot marks the room temperature, which is also written in the gap.
 * Otherwise the ring shows the value (brightness, position, volume) with a handle; while off it
 * says so large.
 */
function open(v: SliderView): string[] {
    const dim = v.offline || v.off;
    const thermostat = v.actual !== undefined;
    const parts = [
        // Over an effect: dark inside the ring and behind the name, the effect stays visible around them
        v.background ? scrimDisc(RING.cx, RING.cy, RING.r + 6) : "",
        v.background && v.label?.trim() ? scrimText(4, 16, v.label.trim(), 12, { maxWidth: 52 }) : "",
        ...openRing({ ...RING, min: v.min, max: v.max, value: v.setpoint, dot: v.actual, zones: v.zones, handle: true, dim }),
    ];
    const unit = v.unit?.trim();
    const top = v.off && thermostat ? v.offText : v.status;
    if (top) parts.push(text(RING.cx, 33, top, { size: 11, color: dim ? DIM : SOFT, anchor: "middle", maxWidth: 60 }));
    const color = dim ? DIM : v.adjusting ? "#ffffff" : "#f2f2f4";
    if (v.off && !thermostat) parts.push(text(RING.cx, 58, v.offText, { size: fitSize(v.offText, 20, 62, 12), color: DIM, weight: "bold", anchor: "middle" }));
    else if (v.setpointText !== undefined) parts.push(bigNumber(v.setpointText, unit, thermostat ? 63 : 60, color));
    if (thermostat && v.actualText !== undefined) parts.push(text(RING.cx, 95, `${v.actualText}${unit ? ` ${unit}` : ""}`, { size: 11, color: dim ? DIM : SOFT, anchor: "middle" }));
    if (v.label?.trim()) parts.push(text(4, 16, v.label.trim(), { size: 12, color: dim ? DIM : SOFT, maxWidth: 52 }));
    else if (v.icon) parts.push(mdi(v.icon, 4, 4, 22, dim ? DIM : SOFT));
    return parts;
}

/** Sonos Controller's pie on the left, the name and value on the right (as the ring look). */
function pieLook(v: SliderView): string[] {
    const dim = v.offline || v.off;
    const s = shown(v);
    const color = dim ? DIM : s.fill !== undefined ? zoneColor(s.fill, v.zones) : SOFT;
    const pos = s.fill !== undefined ? halfArcPosition(s.fill, v.min, v.max) : 0;
    const parts = [...rightColumnScrims(v, s), ...pie(46, 50, 36, dim ? 0 : pos, color)];
    const x = 92;
    if (v.status) parts.push(text(x, 13, v.status, { size: 11, color: dim ? DIM : SOFT, maxWidth: 104 }));
    if (v.label?.trim()) parts.push(text(x, 30, v.label.trim(), { size: 14, color: dim ? DIM : SOFT, maxWidth: 104 }));
    const big = v.off ? v.offText : s.big;
    parts.push(text(x, 62, big, { size: fitSize(big, 26, 104, 14), color, weight: "bold" }));
    if (s.small && !v.off) parts.push(text(x, 84, s.small, { size: 13, color: v.adjusting ? "#ffffff" : SOFT, maxWidth: 104 }));
    return parts;
}

function fitSize(s: string, max: number, width: number, min: number): number {
    let size = max;
    while (size > min && measureArialWidth(s, size, true) > width) size--;
    return size;
}

function short(n: number): string {
    return Number.isInteger(n) ? String(n) : localNumber(n.toFixed(1));
}
