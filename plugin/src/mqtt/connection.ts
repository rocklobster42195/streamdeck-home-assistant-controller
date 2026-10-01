// The plugin's one MQTT broker, shared by every action (configured in ../connections.ts).
import streamDeck from "@elgato/streamdeck";
import { Broker } from "./broker";

export const broker = new Broker({ info: (m) => streamDeck.logger.info(m), warn: (m) => streamDeck.logger.warn(m) });
