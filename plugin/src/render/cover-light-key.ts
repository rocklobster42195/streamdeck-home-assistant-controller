// The Coverlicht key in the family's look: on = the cover's colour as plate, frame and icon, off = a
// grey icon; no lamps or no Home Assistant: dimmed. A pause doesn't change the key (the lamps keep
// their colour then, too).
import { mdiLightbulbAuto, mdiLightbulbAutoOutline } from "@mdi/js";
import { KEY_ICON, KEY_TIERS, keyActiveFrame, keyActivePlate, keyCaption, keyIcon, keySvg } from "@rocklobster42195/streamdeck-kit";

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
    const place = label ? KEY_ICON.withCaption : KEY_ICON.full;
    if (v.unavailable) {
        parts.push(keyIcon(mdiLightbulbAutoOutline, place, KEY_TIERS.unavailable));
        if (label) parts.push(keyCaption(label, KEY_TIERS.unavailable));
        return keySvg(parts);
    }
    if (v.active) {
        const c = v.color ?? KEY_TIERS.available;
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
