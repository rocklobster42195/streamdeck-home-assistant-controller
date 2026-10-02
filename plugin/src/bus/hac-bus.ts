// HA-C on deckbus (see the kit's docs/deckbus-protocol.md): tells the other plugins whether its
// sources are reachable ("status": online when Home Assistant or the MQTT broker is), where HA-C's
// actions are visible ("actions"), and shares the Panorama behind its dials with the other dials
// of the row (one effect per row, see the kit's panorama/rows.ts). HA-C works the same without the bus.
import streamDeck from "@elgato/streamdeck";
import { trackActions } from "@rocklobster42195/streamdeck-kit/bridge";
import { PanoramaEngine, PanoramaRows, SharedPanorama } from "@rocklobster42195/streamdeck-kit";
import { ActionsState, DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { ha } from "../ha/connection";
import { shortHaAddress } from "../ha/url";
import { broker } from "../mqtt/connection";
import { shortAddress } from "../mqtt/url";

let bus: DeckBus | undefined;
let lastStatus = "";
/** Collected from the start, shared once the bus exists. */
const actions = new ActionsState({ setState: (key, value) => bus?.setState(key, value) });

/**
 * HA-C's Panorama (effects behind the Slider dials), shared with the dials of other plugins next
 * to them once the bus runs (local until then; the leftmost dial's plugin runs a shared one).
 */
export const panorama = new SharedPanorama(new PanoramaEngine({ defaultColor: "#F7A600" }), actions);

/** One effect per row of dials (the Slider dials' Panorama section), agreed with the other plugins. */
export const panoramaRows = new PanoramaRows(panorama, { name: "HA-C", actions });

/** Call before streamDeck.connect(), so no willAppear is missed. */
export function trackHacActions(): void {
    trackActions(actions);
}

/** Call after streamDeck.connect() (the plugin version comes from there). */
export async function startHacBus(): Promise<void> {
    bus = new DeckBus({ id: "de.boriskemper.ha-controller", name: "HA-C", version: streamDeck.info.plugin.version, caps: [] });
    bus.setState("actions", actions.list());
    panorama.connect(bus);
    panoramaRows.connect(bus);
    shareStatus();
    if (!(await bus.start())) return;
    streamDeck.logger.info(`[deckbus] HA-C in slot ${bus.slot}`);
    broker.onState(shareStatus);
    ha.onState(shareStatus);
}

function shareStatus(): void {
    const haOnline = ha.state === "online";
    const brokerOnline = broker.state === "online";
    const parts = [
        ha.state === "unconfigured" ? "" : `HA ${haOnline && ha.address ? shortHaAddress(ha.address) : ha.state}`,
        broker.state === "unconfigured" ? "" : `MQTT ${brokerOnline && broker.address ? shortAddress(broker.address) : broker.state}`,
    ].filter(Boolean);
    const status = { online: haOnline || brokerOnline, detail: parts.join(" · ") || "unconfigured" };
    const json = JSON.stringify(status);
    if (json === lastStatus) return;
    lastStatus = json;
    bus?.setState("status", status);
}

export function stopHacBus(): void {
    bus?.stop();
}
