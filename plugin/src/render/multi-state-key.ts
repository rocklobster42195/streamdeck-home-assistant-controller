// The Multi-state key: the current state's icon in its colour, its name below, and a row of dots
// that shows where it is in the list. Unknown: grey with a question mark; offline: dimmed.
import { mdiCloudOffOutline, mdiHelpCircleOutline } from "@mdi/js";
import { BG, icon, lines, SIZE, svgUri } from "./svg";

export type MultiStateKeyView = {
    /** -1 when the device reports none of the states. */
    index: number;
    count: number;
    icon: string;
    color: string;
    /** The state's name (or value); the key's own name when unknown. */
    text?: string;
    offline: boolean;
};

const DIM = "#7a7a80";

export function renderMultiStateKey(v: MultiStateKeyView): string {
    const known = v.index >= 0;
    const ink = v.offline || !known ? DIM : v.color;
    const parts = [`<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>`];
    parts.push(icon(v.icon, 40, 10, 64, ink, v.offline ? 0.35 : 1));
    if (v.text) parts.push(...lines(v.text, 98, 18, v.offline ? DIM : "#FFFFFF", 1, 700));
    // One dot per state, the current one filled in its colour
    const n = Math.min(v.count, 8);
    const gap = 14;
    const x0 = SIZE / 2 - ((n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) {
        const on = i === v.index;
        parts.push(`<circle cx="${x0 + i * gap}" cy="122" r="${on ? 5 : 3.5}" fill="${on && !v.offline ? v.color : "#4a4a50"}"/>`);
    }
    if (!known && !v.offline) parts.push(icon(mdiHelpCircleOutline, SIZE - 40, 8, 30, "#c8c8cc"));
    if (v.offline) parts.push(icon(mdiCloudOffOutline, SIZE - 40, 8, 30, "#ff6b6b"));
    return svgUri(parts);
}
