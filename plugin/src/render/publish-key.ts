// The Trigger key (formerly Publish): its icon in its colour and the name below. Armed (waiting for the confirming
// second press): filled with the colour and "Press again". Offline: dimmed with a cloud badge.
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
    // The family's plain, large icon (MA-C: 112 px); smaller with the name under it
    const size = label ? 88 : 112;
    const y = label ? 6 : (SIZE - size) / 2;
    parts.push(icon(v.icon, (SIZE - size) / 2, y, size, v.offline ? "#7a7a80" : v.color, v.offline ? 0.35 : 1));
    if (label) parts.push(...lines(label, 118, 18, v.offline ? "#7a7a80" : "#FFFFFF", 1));
    if (v.offline) parts.push(icon(mdiCloudOffOutline, SIZE - 42, 8, 32, "#ff6b6b"));
    return svgUri(parts);
}
