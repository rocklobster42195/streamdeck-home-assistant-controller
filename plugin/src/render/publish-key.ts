// The Trigger key (formerly Publish): its icon in its colour and the name below. Armed (waiting for the confirming
// second press): filled with the colour and "Press again". Offline: dimmed with a cloud badge.
import { KEY_ICON, KEY_TIERS, keyCaption, keyIcon } from "@rocklobster42195/streamdeck-kit";
import { mdiCloudOffOutline } from "@mdi/js";
import { BG, icon, lines, SIZE, svgUri } from "./svg";

export type PublishKeyView = {
    icon: string;
    color: string;
    label?: string;
    armed: boolean;
    /** Text while armed ("Press again"). */
    armedText: string;
    offline: boolean;
};

export function renderPublishKey(v: PublishKeyView): string {
    const label = v.label?.trim();
    const parts = [`<rect width="${SIZE}" height="${SIZE}" fill="${v.armed ? v.color : BG}"/>`];
    if (v.armed) {
        parts.push(icon(v.icon, 44, 14, 56, "#111111"));
        parts.push(...lines(v.armedText, 98, 17, "#111111", 2, 700));
        return svgUri(parts);
    }
    // The family's look (the kit's key style): the icon large, the name as a bold caption under it
    const ink = v.offline ? KEY_TIERS.unavailable : v.color;
    parts.push(keyIcon(v.icon, label ? KEY_ICON.withCaption : KEY_ICON.full, ink));
    if (label) parts.push(keyCaption(label, ink));
    if (v.offline) parts.push(icon(mdiCloudOffOutline, SIZE - 42, 8, 32, "#ff6b6b"));
    return svgUri(parts);
}
