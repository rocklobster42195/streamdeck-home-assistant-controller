// Switching something on and off from a key, shared by the Switch key and the Value key's press
// action: publishes the command, shows the new state at once and goes back if the device doesn't
// confirm within 3 s; without a state topic, it toggles by what it sent last. A zigbee2mqtt device
// whose state is unknown is asked for it once.
import streamDeck from "@elgato/streamdeck";
import { OptimisticStore } from "@rocklobster42195/streamdeck-kit";
import { broker } from "../mqtt/connection";
import { switchCommand, switchState, type SwitchState, type SwitchTopics } from "../mqtt/switch-state";
import { stateRequest } from "../mqtt/z2m";

const CONFIRM_MS = 3000;
/** How long a retained state may take to arrive before HA-C asks the device. */
const ASK_DELAY_MS = 1500;

/** State topics asked for since the broker came online (zigbee2mqtt keeps no state). */
const asked = new Set<string>();
broker.onState(() => {
    if (broker.state !== "online") asked.clear();
});

/** Ask a zigbee2mqtt device once for its state when nothing is known about it. */
function askState(s: SwitchTopics): void {
    const req = stateRequest(s.stateTopic, s.commandTopic);
    if (!req || asked.has(req.topic) || broker.state !== "online") return;
    asked.add(req.topic);
    setTimeout(() => {
        if (broker.state !== "online" || payloadOf(s.stateTopic) !== undefined) return;
        broker.publish(req.topic, req.payload);
        streamDeck.logger.info(`[toggle] ${req.topic} ← ${req.payload}`);
    }, ASK_DELAY_MS);
}

export class Toggle {
    private readonly optimistic = new OptimisticStore<{ state: SwitchState }>();
    private readonly revertTimers = new Map<string, ReturnType<typeof setTimeout>>();
    /** Keys without a state topic toggle by what they sent last. */
    private readonly sent = new Map<string, boolean>();

    /** `redraw(id)` is called when an optimistic state runs out. */
    constructor(private readonly redraw: (id: string) => void) {}

    /** The state to show: the device's, or the one just sent while it is unconfirmed. */
    state(id: string, s: SwitchTopics): SwitchState {
        return this.optimistic.apply(id, { state: this.reported(id, s) }).state;
    }

    /** Switch to the other state; false when there is no topic to send to. */
    press(id: string, s: SwitchTopics, opts: { retain?: boolean; qos?: 0 | 1 | 2 } = {}): boolean {
        const turnOn = this.state(id, s) !== "on";
        const cmd = switchCommand(s, turnOn, payloadOf(s.stateTopic));
        if (!cmd) return false;
        broker.publish(cmd.topic, cmd.payload, opts);
        streamDeck.logger.info(`[toggle] ${cmd.topic} ← ${cmd.payload}`);
        if (!s.stateTopic?.trim()) {
            this.sent.set(id, turnOn);
            return true;
        }
        this.optimistic.set(id, { state: turnOn ? "on" : "off" }, CONFIRM_MS);
        clearTimeout(this.revertTimers.get(id));
        this.revertTimers.set(
            id,
            setTimeout(() => this.redraw(id), CONFIRM_MS + 50),
        );
        return true;
    }

    forget(id: string): void {
        clearTimeout(this.revertTimers.get(id));
        this.revertTimers.delete(id);
        this.optimistic.clear(id);
        this.sent.delete(id);
    }

    private reported(id: string, s: SwitchTopics): SwitchState {
        if (!s.stateTopic?.trim()) return this.sent.get(id) ? "on" : "off";
        const payload = payloadOf(s.stateTopic);
        if (payload === undefined) askState(s);
        return switchState(s, payload);
    }
}

function payloadOf(topic: string | undefined): string | undefined {
    return topic?.trim() ? broker.value(topic.trim())?.payload : undefined;
}
