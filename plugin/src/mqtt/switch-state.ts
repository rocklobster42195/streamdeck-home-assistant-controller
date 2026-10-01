// The Switch key's logic without Stream Deck: what a received payload means (on, off, unknown)
// and what to publish to turn the device on or off.
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

export function switchState(s: SwitchTopics, payload: string | undefined): SwitchState {
    const v = readValue(payload, s.field);
    if (sameValue(v, s.onValue || DEFAULT_ON)) return "on";
    if (sameValue(v, s.offValue || DEFAULT_OFF)) return "off";
    return "unknown";
}

/** Topic and payload that switch the device; undefined without any topic. */
export function switchCommand(s: SwitchTopics, turnOn: boolean): { topic: string; payload: string } | undefined {
    const topic = s.commandTopic?.trim() || s.stateTopic?.trim();
    if (!topic) return undefined;
    const value = turnOn ? s.commandOn || s.onValue || DEFAULT_ON : s.commandOff || s.offValue || DEFAULT_OFF;
    return { topic, payload: fillTemplate(s.template, value) };
}
