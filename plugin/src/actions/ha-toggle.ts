// Switching a Home Assistant entity from a key: calls the domain's service (light.turn_on, lock.lock,
// cover.open_cover, …), shows the new state at once and goes back if HA doesn't confirm within 3 s.
import streamDeck from "@elgato/streamdeck";
import { OptimisticStore } from "@rocklobster42195/streamdeck-kit";
import { ha } from "../ha/connection";
import { haSwitchService, haSwitchState } from "../ha/entities";
import type { SwitchState } from "../mqtt/switch-state";

const CONFIRM_MS = 3000;

export class HaToggle {
    private readonly optimistic = new OptimisticStore<{ state: SwitchState }>();
    private readonly revertTimers = new Map<string, ReturnType<typeof setTimeout>>();

    /** `redraw(id)` is called when an optimistic state runs out. */
    constructor(private readonly redraw: (id: string) => void) {}

    /** The state to show: HA's, or the one just asked for while it is unconfirmed. */
    state(id: string, entityId: string): SwitchState {
        return this.optimistic.apply(id, { state: haSwitchState(ha.entities[entityId]) }).state;
    }

    /** Switch to the other state; false when the entity can't be switched. */
    press(id: string, entityId: string): boolean {
        const turnOn = this.state(id, entityId) !== "on";
        const call = haSwitchService(entityId, turnOn);
        if (!call || !ha.connection) return false;
        streamDeck.logger.info(`[ha] ${call.domain}.${call.service} ${entityId}`);
        void ha.call(call.domain, call.service, entityId).then((ok) => {
            if (ok) return;
            this.optimistic.clear(id);
            this.redraw(id);
        });
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
    }
}
