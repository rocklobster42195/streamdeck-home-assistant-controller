// The Slider dial's logic without Stream Deck: stepping a value by dial ticks within its range,
// and formatting it for sending and for the display.

export type SliderRange = { min: number; max: number; step: number };

/** The value after `ticks` steps, snapped to the step grid from min and kept in the range. */
export function stepValue(current: number | undefined, ticks: number, r: SliderRange): number {
    const step = r.step > 0 ? r.step : 1;
    const start = current === undefined || !Number.isFinite(current) ? r.min : current;
    const snapped = r.min + Math.round((start - r.min) / step) * step;
    const next = snapped + ticks * step;
    return round(Math.min(r.max, Math.max(r.min, next)), decimalsOf(step));
}

/** Decimals a step needs ("0.5" → 1, "1" → 0). */
export function decimalsOf(step: number): number {
    const s = String(step);
    const i = s.indexOf(".");
    return i < 0 ? 0 : Math.min(6, s.length - i - 1);
}

/** The number as text: with the given decimals, or as many as the step needs. */
export function formatNumber(n: number, step: number, decimals?: string): string {
    const d = decimals === undefined || decimals === "" ? decimalsOf(step) : Number(decimals);
    return Number.isInteger(d) && d >= 0 && d <= 6 ? n.toFixed(d) : String(n);
}

function round(n: number, decimals: number): number {
    const f = 10 ** decimals;
    return Math.round(n * f) / f;
}
