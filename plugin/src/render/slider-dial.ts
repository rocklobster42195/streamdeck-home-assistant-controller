// The Slider dial's display (200×100). "Half": a half circle with the colour ranges, the value
// inside it; with an actual value, the arc shows the actual value and a marker the setpoint
// (thermostat), and the setpoint is written small under the value. "Ring": MA-C's ring on the
// left, the name and value on the right. Off (what a push switches is off): dimmed with "Off".
// Offline: dimmed with a cloud badge.
import { arc, halfArc, halfArcPosition, measureArialWidth, mdi, stripImage, text, zoneColor, type Zones } from "@rocklobster42195/streamdeck-kit";
import { mdiCloudOffOutline } from "@mdi/js";

export type SliderView = {
    look: "half" | "ring";
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
    offText: string;
    offline: boolean;
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
    const parts = v.look === "ring" ? ring(v) : half(v);
    if (v.offline) parts.push(mdi(mdiCloudOffOutline, 174, 4, 22, "#ff6b6b"));
    return stripImage(parts);
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
    parts.push(text(cx, cy - 12, big, { size: fitSize(big, 30, 92, 16), color, weight: "bold", anchor: "middle" }));
    if (s.small && !v.off) parts.push(text(cx, cy + 6, s.small, { size: 14, color: v.adjusting ? "#ffffff" : SOFT, anchor: "middle", maxWidth: 110 }));
    if (v.label?.trim()) parts.push(text(4, 14, v.label.trim(), { size: 13, color: dim ? DIM : SOFT, maxWidth: 66 }));
    else if (v.icon) parts.push(mdi(v.icon, 4, 2, 20, dim ? DIM : SOFT));
    // Range at the ends of the arc
    parts.push(text(cx - r, 96, v.rangeLabels?.[0] ?? short(v.min), { size: 11, color: DIM, anchor: "middle" }), text(cx + r, 96, v.rangeLabels?.[1] ?? short(v.max), { size: 11, color: DIM, anchor: "middle" }));
    return parts;
}

function ring(v: SliderView): string[] {
    const dim = v.offline || v.off;
    const s = shown(v);
    const color = dim ? DIM : s.fill !== undefined ? zoneColor(s.fill, v.zones) : SOFT;
    const pos = s.fill !== undefined ? halfArcPosition(s.fill, v.min, v.max) : 0;
    const parts = arc(46, 50, 34, dim ? 0 : pos, color, { width: 8 });
    if (v.icon) parts.push(mdi(v.icon, 32, 36, 28, dim ? DIM : SOFT));
    else parts.push(text(46, 56, `${Math.round(pos * 100)}%`, { size: 15, color: dim ? DIM : "#ffffff", weight: "bold", anchor: "middle" }));
    const x = 92;
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
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
