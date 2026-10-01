// Switching something on and off from a key, shared by the Switch key and the Value key's press
// action: publishes the command, shows the new state at once and goes back if the device doesn't
// confirm within 3 s; without a state topic, it toggles by what it sent last.
import streamDeck from "@elgato/streamdeck";
import { OptimisticStore } from "@rocklobster42195/streamdeck-kit";
import { broker } from "../mqtt/connection";
import { switchCommand, switchState, type SwitchState, type SwitchTopics } from "../mqtt/switch-state";

const CONFIRM_MS = 3000;

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
        return switchState(s, payloadOf(s.stateTopic));
    }
}

function payloadOf(topic: string | undefined): string | undefined {
    return topic?.trim() ? broker.value(topic.trim())?.payload : undefined;
}
