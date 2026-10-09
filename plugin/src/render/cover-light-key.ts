// The Coverlicht key in the family's look: on = the lamps' colour as plate, frame and icon (dimmed
// while the player pauses), off = a grey icon; no lamps or no Home Assistant: dimmed.
import { mdiLightbulbAuto, mdiLightbulbAutoOutline } from "@mdi/js";
import { KEY_ICON, KEY_TIERS, keyActiveFrame, keyActivePlate, keyCaption, keyIcon, keySvg } from "@rocklobster42195/streamdeck-kit";

export type CoverLightView = {
    active: boolean;
    /** The colour the lamps get (full brightness), when there is one. */
    color?: string;
    playing: boolean;
    unavailable: boolean;
    label?: string;
};

/** Paused: the colour halfway to the key's black. */
const DIM = 0.5;

export function renderCoverLightKey(v: CoverLightView): string {
    const parts: string[] = [];
    const label = v.label?.trim();
    const place = label ? KEY_ICON.withCaption : KEY_ICON.full;
    if (v.unavailable) {
        parts.push(keyIcon(mdiLightbulbAutoOutline, place, KEY_TIERS.unavailable));
        if (label) parts.push(keyCaption(label, KEY_TIERS.unavailable));
        return keySvg(parts);
    }
    if (v.active) {
        const c = dim(v.color ?? KEY_TIERS.available, v.playing ? 1 : DIM);
        parts.push(keyActivePlate(c));
        parts.push(keyIcon(mdiLightbulbAuto, place, c));
        if (label) parts.push(keyCaption(label, "#ffffff"));
        parts.push(keyActiveFrame(c));
    } else {
        parts.push(keyIcon(mdiLightbulbAutoOutline, place, KEY_TIERS.off));
        if (label) parts.push(keyCaption(label, "#c8c8cc"));
    }
    return keySvg(parts);
}

function dim(hex: string, f: number): string {
    if (f >= 1) return hex;
    const n = parseInt(hex.slice(1), 16);
    const bg = 0x10;
    const mix = (v: number) => Math.round(bg + (v - bg) * f);
    return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, "0")).join("")}`;
}
