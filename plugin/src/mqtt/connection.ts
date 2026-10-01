// The plugin's one broker: global settings (address, login), the client id kept across restarts,
// and the shared Broker instance every action uses.
import streamDeck from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { Broker, newClientId } from "./broker";

export type GlobalSettings = {
    /** "192.168.1.10", "mqtts://broker:8883", "ws://host:9001/mqtt", … */
    brokerUrl?: string;
    brokerUser?: string;
    brokerPassword?: string;
    allowSelfSigned?: boolean;
    /** Generated once ("hac-1a2b3c4d") so the broker recognises the plugin. */
    clientId?: string;
} & JsonObject;

export const broker = new Broker({ info: (m) => streamDeck.logger.info(m), warn: (m) => streamDeck.logger.warn(m) });

let current: GlobalSettings = {};

/** Call after streamDeck.connect(): reads the settings (creating the client id once) and connects. */
export async function startConnection(): Promise<void> {
    streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => apply(ev.settings));
    const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    if (!settings.clientId) {
        settings.clientId = newClientId();
        await streamDeck.settings.setGlobalSettings(settings);
    }
    apply(settings);
}

/** Try again now (the connection card's "Connect" button, or after "access denied"). */
export function reconnect(): void {
    configure(current, true);
}

function apply(settings: GlobalSettings): void {
    // The PI may save global settings without the client id it doesn't know about; keep ours
    current = { ...settings, clientId: settings.clientId || current.clientId };
    configure(current);
}

function configure(s: GlobalSettings, force = false): void {
    broker.configure({ url: s.brokerUrl, user: s.brokerUser, password: s.brokerPassword, allowSelfSigned: s.allowSelfSigned, clientId: s.clientId || newClientId() }, force);
}
