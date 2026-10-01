// The Multi-state key's logic without Stream Deck: which of the user's states a payload is, which
// comes next, and what to publish for it.
import { fillTemplate, readValue, sameValue } from "./payload";

export type StateOption = {
    /** What the device reports and gets sent ("1", "low", "auto"). */
    value: string;
    /** Shown on the key; the value when empty. */
    label?: string;
    /** MDI icon name. */
    icon?: string;
    color?: string;
};

/** The usable states from the settings (rows without a value are skipped). */
export function stateOptions(raw: unknown): StateOption[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((o): o is StateOption => !!o && typeof o === "object" && typeof (o as StateOption).value === "string" && (o as StateOption).value.trim() !== "")
        .map((o) => ({ value: o.value.trim(), label: o.label, icon: o.icon, color: o.color }));
}

/** Index of the state the payload reports; -1 when it is none of them (or nothing arrived). */
export function stateIndex(options: StateOption[], payload: string | undefined, field?: string): number {
    const v = readValue(payload, field);
    return options.findIndex((o) => sameValue(v, o.value));
}

/** The state after `index`, wrapping around; the first one when the current state is unknown. */
export function nextIndex(index: number, count: number): number {
    return count ? (index < 0 ? 0 : (index + 1) % count) : -1;
}

/** Topic and payload that select a state. */
export function stateCommand(s: { stateTopic?: string; commandTopic?: string; template?: string }, option: StateOption): { topic: string; payload: string } | undefined {
    const topic = s.commandTopic?.trim() || s.stateTopic?.trim();
    return topic ? { topic, payload: fillTemplate(s.template, option.value) } : undefined;
}
