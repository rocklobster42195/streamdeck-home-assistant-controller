// The Switch key: the state's icon large, without a background (on: in its colour, off: grey), the name and an optional
// value line ("42 W") below. Unknown state: grey with a question mark; offline: dimmed with a
// cloud badge; nothing set up: a hint.
import { mdiCloudOffOutline, mdiHelpCircleOutline, mdiLightbulbOnOutline } from "@mdi/js";
import type { SwitchState } from "../mqtt/switch-state";
import { BG, icon, lines, SIZE, svgUri } from "./svg";

export type SwitchKeyView = {
    state: SwitchState;
    offline: boolean;
    /** MDI paths for on and off. */
    iconOn: string;
    iconOff: string;
    colorOn: string;
    label?: string;
    /** Value line with its unit, e.g. "42 W". */
    value?: string;
};

const OFF_INK = "#7a7a80";

export function renderSwitchKey(v: SwitchKeyView): string {
    const on = v.state === "on";
    const label = v.label?.trim();
    const value = v.value?.trim();
    // The family's plain, large icon (MA-C: 112 px); smaller with one or two text lines under it
    const size = label && value ? 68 : label || value ? 88 : 112;
    const x = (SIZE - size) / 2;
    const y = label && value ? 4 : label || value ? 6 : (SIZE - size) / 2;
    const fade = v.offline ? 0.35 : 1;
    const parts = [`<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>`];
    parts.push(icon(on ? v.iconOn : v.iconOff, x, y, size, on ? v.colorOn : OFF_INK, fade));
    if (v.state === "unknown" && !v.offline) parts.push(icon(mdiHelpCircleOutline, SIZE - 42, 8, 32, "#c8c8cc"));
    if (v.offline) parts.push(icon(mdiCloudOffOutline, SIZE - 42, 8, 32, "#ff6b6b"));
    const ink = v.offline ? OFF_INK : on ? "#FFFFFF" : "#c8c8cc";
    if (label) parts.push(...lines(label, value ? 96 : 118, value ? 17 : 18, ink, 1));
    if (value) parts.push(...lines(value, label ? 124 : 120, label ? 20 : 22, ink, 1, 700));
    return svgUri(parts);
}

/** Not set up yet, or no broker: an icon and a short text. */
export function renderKeyHint(text: string, path = mdiLightbulbOnOutline, warn = false): string {
    return svgUri([`<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>`, icon(path, 48, 22, 48, warn ? "#ff6b6b" : OFF_INK), ...lines(text, 96, 16, "#c8c8cc", 2, 400)]);
}
