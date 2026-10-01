// The Switch key's logic without Stream Deck: what a received payload means (on, off, unknown)
// and what to publish to turn the device on or off. Without own on/off values, the usual pairs are
// recognised (ON/OFF, true/false, 1/0, …) and commands use the pair the device reports.
import { fillTemplate, readValue, sameValue } from "./payload";

export type SwitchTopics = {
    stateTopic?: string;
    /** Defaults to the state topic. */
    commandTopic?: string;
    /** JSON field of the state payload; empty for plain text. */
    field?: string;
    onValue?: string;
    offValue?: string;
    /** What to send, when it differs from what the device reports. */
    commandOn?: string;
    commandOff?: string;
    template?: string;
};

export type SwitchState = "on" | "off" | "unknown";

export const DEFAULT_ON = "ON";
export const DEFAULT_OFF = "OFF";

/** Pairs understood without own values; the first is sent when nothing is known yet. */
export const AUTO_PAIRS: readonly (readonly [string, string])[] = [
    ["ON", "OFF"],
    ["true", "false"],
    ["1", "0"],
    ["open", "closed"],
];

/** The pair a received value belongs to (keeping the device's spelling, e.g. "on"/"off"). */
function pairOf(v: string | undefined): [string, string] | undefined {
    if (v === undefined) return undefined;
    const t = v.trim();
    for (const [on, off] of AUTO_PAIRS) {
        if (sameValue(t, on)) return [t, matchCase(off, t)];
        if (sameValue(t, off)) return [matchCase(on, t), t];
    }
    return undefined;
}

/** `word` in the case style of `like` ("on" for "off", "ON" for "OFF", "True" stays as given). */
function matchCase(word: string, like: string): string {
    if (like === like.toLowerCase()) return word.toLowerCase();
    if (like === like.toUpperCase()) return word.toUpperCase();
    return word;
}

/** The on/off values in use: the user's, or the pair the payload belongs to. */
function values(s: SwitchTopics, payload: string | undefined): [string, string] | undefined {
    if (s.onValue || s.offValue) return [s.onValue || DEFAULT_ON, s.offValue || DEFAULT_OFF];
    return pairOf(readValue(payload, s.field));
}

export function switchState(s: SwitchTopics, payload: string | undefined): SwitchState {
    const v = readValue(payload, s.field);
    const pair = values(s, payload);
    if (!pair) return "unknown";
    if (sameValue(v, pair[0])) return "on";
    if (sameValue(v, pair[1])) return "off";
    return "unknown";
}

/**
 * Topic and payload that switch the device; undefined without any topic. `payload` is the last
 * reported state, so a device that says true/false also gets true/false.
 */
export function switchCommand(s: SwitchTopics, turnOn: boolean, payload?: string): { topic: string; payload: string } | undefined {
    const topic = s.commandTopic?.trim() || s.stateTopic?.trim();
    if (!topic) return undefined;
    const [on, off] = values(s, payload) ?? [DEFAULT_ON, DEFAULT_OFF];
    const value = turnOn ? s.commandOn || on : s.commandOff || off;
    return { topic, payload: fillTemplate(s.template, value) };
}
