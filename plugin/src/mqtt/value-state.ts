// The Value key's logic without Stream Deck: the value from a payload (a number when it is one),
// formatted with the chosen decimals, and the colour zones from the settings.
import type { Zones } from "@rocklobster42195/streamdeck-kit";
import { localNumber } from "../format";
import { readValue } from "./payload";

export type Threshold = { from: number; color: string };

export type ShownValue = {
    /** The text to show ("21.5", "21,5" in German, "open"); undefined before anything arrived. */
    text?: string;
    /** The number, when the value is one. */
    number?: number;
};

/** Read and format a value; `decimals` empty or undefined keeps the device's own precision. */
export function shownValue(payload: string | undefined, field?: string, decimals?: string | number): ShownValue {
    const raw = readValue(payload, field)?.trim();
    if (raw === undefined || raw === "") return {};
    const n = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isFinite(n)) return { text: raw };
    const d = decimals === undefined || decimals === "" ? undefined : Number(decimals);
    const text = d !== undefined && Number.isInteger(d) && d >= 0 && d <= 6 ? n.toFixed(d) : raw;
    // For showing: a decimal comma in German (see format.ts)
    return { text: localNumber(text), number: n };
}

/** Zones for the kit's gauges: the base colour below everything, then the thresholds in order. */
export function zonesOf(base: string, thresholds: unknown): Zones {
    const rows = Array.isArray(thresholds) ? (thresholds as Threshold[]).filter((t) => t && Number.isFinite(Number(t.from)) && typeof t.color === "string") : [];
    return [{ from: -Infinity, color: base }, ...rows.map((t) => ({ from: Number(t.from), color: t.color })).sort((a, b) => a.from - b.from)];
}

/** A number setting ("0", "", undefined) with a fallback. */
export function numberSetting(v: unknown, fallback: number): number {
    if (v === undefined || v === null || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
