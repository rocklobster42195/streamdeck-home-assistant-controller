// The plugin's one Home Assistant, shared by every action (configured in ../connections.ts).
import streamDeck from "@elgato/streamdeck";
import { HaConnection } from "./ha-connection";

export const ha = new HaConnection({ info: (m) => streamDeck.logger.info(m), warn: (m) => streamDeck.logger.warn(m) });
