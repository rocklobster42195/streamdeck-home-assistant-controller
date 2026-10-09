// The "Coverfarbe" sensor's content (cover-light grill 2026-10-09): the colour of a player's cover as
// hex (the state, which changes only with the colour) and as rgb/hs for automations, plus what
// plays. The raw colour, as the deckbus has it: what lamps make of it is up to the automation.
import type { Player } from "@rocklobster42195/streamdeck-kit";

export type CoverColorReport = {
    state: string;
    attributes: {
        rgb_color: [number, number, number];
        hs_color: [number, number];
        playing: boolean;
        player: string;
        player_id: string;
        title?: string;
        artist?: string;
        /** The music service ("Spotify"), when the player says. */
        source?: string;
    };
};

/** The report for a player; undefined while it has no colour (the sensor then keeps the last one). */
export function coverColorReport(p: Player | undefined): CoverColorReport | undefined {
    const rgb = p?.color ? hexToRgb(p.color) : undefined;
    if (!p || !rgb) return undefined;
    return {
        state: rgbToHex(rgb),
        attributes: {
            rgb_color: rgb,
            hs_color: rgbToHs(rgb),
            playing: p.playing,
            player: p.name,
            player_id: p.id,
            ...(p.title ? { title: p.title } : {}),
            ...(p.artist ? { artist: p.artist } : {}),
            ...(p.source ? { source: p.source } : {}),
        },
    };
}

export function hexToRgb(hex: string): [number, number, number] | undefined {
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
    if (!m) return undefined;
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbToHex(rgb: readonly number[]): string {
    return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** HA's hs_color: hue 0–360, saturation 0–100, one decimal. */
export function rgbToHs([r, g, b]: readonly number[]): [number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max ? (d / max) * 100 : 0;
    return [Math.round(h * 10) / 10, Math.round(s * 10) / 10];
}
