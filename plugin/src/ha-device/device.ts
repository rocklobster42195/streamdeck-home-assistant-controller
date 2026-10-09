// The plugin's one HaDevice (see ha-device.ts), switched by the global setting `haDevice`.
import { hostname } from "node:os";
import streamDeck from "@elgato/streamdeck";
import { hacPlayers } from "../bus/hac-players";
import { ha } from "../ha/connection";
import { broker } from "../mqtt/connection";
import { HaDevice } from "./ha-device";
import { bridgeTopics } from "./discovery";

let nodeId: string | undefined;

export const haDevice = new HaDevice({
    board: hacPlayers,
    broker,
    ha,
    info: () => (nodeId ? { nodeId, host: hostname(), version: streamDeck.info.plugin.version, language: streamDeck.info.application.language || "en" } : undefined),
});

/** From the global settings; call before configuring the broker, which needs the last will. */
export function configureHaDevice(enabled: boolean, clientId: string): void {
    nodeId = clientId;
    haDevice.setEnabled(enabled);
}

/** The broker's last will while the device is on: the bridge goes "offline" in HA. */
export function haDeviceWill(enabled: boolean, clientId: string) {
    return enabled ? { topic: bridgeTopics(clientId).status, payload: "offline", retain: true } : undefined;
}
