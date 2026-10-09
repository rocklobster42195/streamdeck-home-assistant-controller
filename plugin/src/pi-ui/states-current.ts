// "Add “<value>”" in the kit's <pi-states> (the Multi-state key's list): the value the device
// reports right now, from Home Assistant (the entity's state) or MQTT (the state topic's payload,
// or the chosen JSON field of it).
import { nextRequestId, registerStatesCurrent, sd } from "@rocklobster42195/streamdeck-kit/pi";
import type { PiPush } from "../pi/protocol";

let asked = 0;
let answer: ((value: string | undefined) => void) | undefined;

export function initStatesCurrent(): void {
    sd.onMessage((msg: PiPush) => {
        if (msg?.event === "ha-attributes-result" && msg.requestId === asked) answer?.(msg.state);
        else if (msg?.event === "topic-info-result" && msg.requestId === asked) {
            const field = String(sd.settings.field ?? "");
            answer?.(field ? msg.info.fields.find((x) => x.path === field)?.value : msg.info.payload);
        }
    });
    registerStatesCurrent((settings, report) => {
        answer = report;
        const entityId = settings.source === "ha" ? String(settings.entityId ?? "").trim() : "";
        const topic = String(settings.stateTopic ?? "").trim();
        if (!entityId && !topic) return report(undefined);
        asked = nextRequestId();
        if (entityId) sd.sendToPlugin({ event: "ha-attributes", requestId: asked, entityId });
        else sd.sendToPlugin({ event: "topic-info", requestId: asked, topic });
    });
}
