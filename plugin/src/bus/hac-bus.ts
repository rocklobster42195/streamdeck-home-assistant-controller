// HA-C on deckbus (see the kit's docs/deckbus-protocol.md): tells the other plugins whether the
// broker is reachable ("status") and where HA-C's actions are visible ("actions"). HA-C works the
// same without the bus.
import streamDeck from "@elgato/streamdeck";
import { trackActions } from "@rocklobster42195/streamdeck-kit/bridge";
import { ActionsState, DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { broker } from "../mqtt/connection";
import { shortAddress } from "../mqtt/url";

let bus: DeckBus | undefined;
let lastStatus = "";
/** Collected from the start, shared once the bus exists. */
const actions = new ActionsState({ setState: (key, value) => bus?.setState(key, value) });

/** Call before streamDeck.connect(), so no willAppear is missed. */
export function trackHacActions(): void {
    trackActions(actions);
}

/** Call after streamDeck.connect() (the plugin version comes from there). */
export async function startHacBus(): Promise<void> {
    bus = new DeckBus({ id: "de.boriskemper.ha-controller", name: "HA-C", version: streamDeck.info.plugin.version, caps: [] });
    bus.setState("actions", actions.list());
    shareStatus();
    if (!(await bus.start())) return;
    streamDeck.logger.info(`[deckbus] HA-C in slot ${bus.slot}`);
    broker.onState(shareStatus);
}

function shareStatus(): void {
    const online = broker.state === "online";
    const status = { online, detail: online && broker.address ? shortAddress(broker.address) : broker.state };
    const json = JSON.stringify(status);
    if (json === lastStatus) return;
    lastStatus = json;
    bus?.setState("status", status);
}

export function stopHacBus(): void {
    bus?.stop();
}
