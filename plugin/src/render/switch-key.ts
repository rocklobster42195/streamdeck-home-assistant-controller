// The Switch key in the family's look (the kit's key style, as MA-C): the state's icon large;
// on: in its colour on a tinted plate with a rounded frame, off: grey. The name as a bold caption
// under the icon, an optional value line ("42 W") under that. Unknown state: grey with a question
// mark; offline: dimmed with a cloud badge; nothing set up: a hint.
import { KEY_ICON, KEY_TIERS, keyActiveFrame, keyActivePlate, keyCaption, keyIcon, keySvg } from "@rocklobster42195/streamdeck-kit";
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
    /** Names in the key's colour instead of white (an option in the settings window). */
    colorCaption?: boolean;
};

const OFF_INK = KEY_TIERS.off;

export function renderSwitchKey(v: SwitchKeyView): string {
    const on = v.state === "on" && !v.offline;
    const label = v.label?.trim();
    const value = v.value?.trim();
    const ink = v.offline ? KEY_TIERS.unavailable : on ? v.colorOn : OFF_INK;
    const path = v.state === "on" ? v.iconOn : v.iconOff;
    // Names white (readable on every colour) or in the key's colour; grey while off
    const text = v.offline ? KEY_TIERS.unavailable : on ? (v.colorCaption ? v.colorOn : "#FFFFFF") : v.colorCaption ? OFF_INK : "#c8c8cc";
    const parts: string[] = [];
    if (on) parts.push(keyActivePlate(v.colorOn));
    if (label && value) {
        // Two lines: a smaller icon, the name and the value under it
        parts.push(keyIcon(path, { size: 68, x: 38, y: 4 }, ink));
        parts.push(keyCaption(label, text, { y: 98, max: 20, min: 13 }));
        parts.push(keyCaption(value, text, { y: 128, max: 24, min: 14 }));
    } else if (label || value) {
        parts.push(keyIcon(path, KEY_ICON.withCaption, ink));
        parts.push(keyCaption((label || value)!, text));
    } else parts.push(keyIcon(path, KEY_ICON.full, ink));
    if (v.state === "unknown" && !v.offline) parts.push(icon(mdiHelpCircleOutline, SIZE - 42, 8, 32, "#c8c8cc"));
    if (v.offline) parts.push(icon(mdiCloudOffOutline, SIZE - 42, 8, 32, "#ff6b6b"));
    if (on) parts.push(keyActiveFrame(v.colorOn));
    return keySvg(parts, BG);
}

/** Not set up yet, or no broker: an icon and a short text. */
export function renderKeyHint(text: string, path = mdiLightbulbOnOutline, warn = false): string {
    return svgUri([`<rect width="${SIZE}" height="${SIZE}" fill="${BG}"/>`, icon(path, 48, 22, 48, warn ? "#ff6b6b" : OFF_INK), ...lines(text, 96, 16, "#c8c8cc", 2, 400)]);
}
