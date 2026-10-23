// The Coverlicht key in the family's look: on = the cover's colour as plate, frame and icon, off = a
// grey icon; no lamps or no Home Assistant: dimmed. A pause doesn't change the key (the lamps keep
// their colour then, too).
import { mdiLightbulbAuto, mdiLightbulbAutoOutline } from "@mdi/js";
import { KEY_ICON, KEY_TIERS, keyActiveFrame, keyActivePlate, keyIcon, keyLabel, keySvg } from "@rocklobster42195/streamdeck-kit";

export type CoverLightView = {
    active: boolean;
    /** The cover's colour (as on the other keys), when there is one. */
    color?: string;
    unavailable: boolean;
    label?: string;
};

export function renderCoverLightKey(v: CoverLightView): string {
    const parts: string[] = [];
    const label = v.label?.trim();
    // The icon and the name: a short name sits under the icon, a long one breaks onto two lines (kit keyLabel)
    const put = (path: string, ink: string, textColor: string): string[] => {
        if (!label) return [keyIcon(path, KEY_ICON.full, ink)];
        const l = keyLabel(label, textColor);
        return [keyIcon(path, l.place, ink), l.svg];
    };
    if (v.unavailable) return keySvg(put(mdiLightbulbAutoOutline, KEY_TIERS.unavailable, KEY_TIERS.unavailable));
    if (v.active) {
        const c = v.color ?? KEY_TIERS.available;
        parts.push(keyActivePlate(c), ...put(mdiLightbulbAuto, c, "#ffffff"), keyActiveFrame(c));
    } else parts.push(...put(mdiLightbulbAutoOutline, KEY_TIERS.off, "#c8c8cc"));
    return keySvg(parts);
}
