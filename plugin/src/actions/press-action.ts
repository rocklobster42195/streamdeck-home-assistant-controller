// What a press does on keys and dials that mainly show something (Value key, Slider dial):
// nothing, switch another topic on and off (like the Switch key), or send a fixed payload.
// The settings carry a "press" prefix: pressStateTopic, pressCommandTopic, …, sendTopic, sendPayload.
import streamDeck from "@elgato/streamdeck";
import { broker } from "../mqtt/connection";
import type { SwitchState, SwitchTopics } from "../mqtt/switch-state";
import type { Toggle } from "./toggle";

export type PressSettings = {
    pressAction?: "none" | "toggle" | "send";
    pressStateTopic?: string;
    pressCommandTopic?: string;
    pressField?: string;
    pressOnValue?: string;
    pressOffValue?: string;
    pressCommandOn?: string;
    pressCommandOff?: string;
    pressTemplate?: string;
    pressColor?: string;
    sendTopic?: string;
    sendPayload?: string;
};

export function pressTopics(s: PressSettings): SwitchTopics {
    return {
        stateTopic: s.pressStateTopic,
        commandTopic: s.pressCommandTopic,
        field: s.pressField,
        onValue: s.pressOnValue,
        offValue: s.pressOffValue,
        commandOn: s.pressCommandOn,
        commandOff: s.pressCommandOff,
        template: s.pressTemplate,
    };
}

/** The topic to listen to for the press action's state. */
export function pressListenTopic(s: PressSettings): string | undefined {
    return s.pressAction === "toggle" ? s.pressStateTopic : undefined;
}

/** The state of what a press switches; undefined when the press doesn't switch or reports nothing. */
export function pressState(s: PressSettings, toggle: Toggle, id: string): SwitchState | undefined {
    return s.pressAction === "toggle" && s.pressStateTopic?.trim() ? toggle.state(id, pressTopics(s)) : undefined;
}

/** Run the press action: "ok" (show a check), "done", "failed" (show an alert) or "none". */
export function runPress(s: PressSettings, toggle: Toggle, id: string, who: string): "ok" | "done" | "failed" | "none" {
    if (s.pressAction === "toggle") return toggle.press(id, pressTopics(s)) ? "done" : "failed";
    if (s.pressAction === "send") {
        const topic = s.sendTopic?.trim();
        if (!topic || !broker.publish(topic, s.sendPayload ?? "")) return "failed";
        streamDeck.logger.info(`[${who}] ${topic} ← ${s.sendPayload ?? ""}`);
        return "ok";
    }
    return "none";
}
