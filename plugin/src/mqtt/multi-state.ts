// The Multi-state key's MQTT side: which of the user's states a payload is, and what to publish for
// one. The list itself, stepping and the picture are the kit's (multi-state).
import { type StateOption } from "@rocklobster42195/streamdeck-kit";
import { fillTemplate, readValue, sameValue } from "./payload";

export { nextIndex, stateOptions, type StateOption } from "@rocklobster42195/streamdeck-kit";

/** Index of the state the payload reports; -1 when it is none of them (or nothing arrived). */
export function stateIndex(options: StateOption[], payload: string | undefined, field?: string): number {
    const v = readValue(payload, field);
    return options.findIndex((o) => sameValue(v, o.value));
}

/** Topic and payload that select a state. */
export function stateCommand(s: { stateTopic?: string; commandTopic?: string; template?: string }, option: StateOption): { topic: string; payload: string } | undefined {
    const topic = s.commandTopic?.trim() || s.stateTopic?.trim();
    return topic ? { topic, payload: fillTemplate(s.template, option.value) } : undefined;
}
