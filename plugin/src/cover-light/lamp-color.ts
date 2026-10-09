// The cover colour as a lamp shows it (cover-light grill 2026-10-09, Q7): covers are often pale or
// dark, so only the hue is kept and the saturation raised; a grey cover gives warm white. The
// lamp's brightness is not part of it (the key keeps it, or sets a fixed one).
import { hexToRgb, rgbToHs } from "../ha-device/cover-color";

/** At least this saturation (0–100) on the lamp. */
export const MIN_SATURATION = 60;
/** Below this saturation the cover counts as grey. */
export const GREY_BELOW = 12;
export const WARM_WHITE_KELVIN = 2700;

export type LampColor = { hs_color: [number, number] } | { color_temp_kelvin: number };

export function lampColor(hex: string): LampColor | undefined {
    const rgb = hexToRgb(hex);
    if (!rgb) return undefined;
    const [h, s] = rgbToHs(rgb);
    return s < GREY_BELOW ? { color_temp_kelvin: WARM_WHITE_KELVIN } : { hs_color: [h, Math.max(s, MIN_SATURATION)] };
}
