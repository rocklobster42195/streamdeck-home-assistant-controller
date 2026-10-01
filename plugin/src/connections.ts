// The plugin's two sources, set up in Stream Deck's global settings: Home Assistant (address and
// long-lived token) and the MQTT broker (address, login, client id kept across restarts). Either
// one may stay unconfigured.
import streamDeck from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { ha } from "./ha/connection";
import { newClientId } from "./mqtt/broker";
import { broker } from "./mqtt/connection";

export type GlobalSettings = {
    /** "192.168.1.20", "http://homeassistant.local:8123", "https://ha.example.org", … */
    haUrl?: string;
    /** A long-lived access token from the HA user profile. */
    haToken?: string;
    /** "192.168.1.10", "mqtts://broker:8883", "ws://host:9001/mqtt", … */
    brokerUrl?: string;
    brokerUser?: string;
    brokerPassword?: string;
    allowSelfSigned?: boolean;
    /** Generated once ("hac-1a2b3c4d") so the broker recognises the plugin. */
    clientId?: string;
} & JsonObject;

let current: GlobalSettings = {};

/** Call after streamDeck.connect(): reads the settings (creating the client id once) and connects. */
export async function startConnections(): Promise<void> {
    streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => apply(ev.settings));
    const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    if (!settings.clientId) {
        settings.clientId = newClientId();
        await streamDeck.settings.setGlobalSettings(settings);
    }
    apply(settings);
}

/** Try the broker again now (its card's "Connect" button, or after "access denied"). */
export function reconnectBroker(): void {
    configureBroker(current, true);
}

/** Try Home Assistant again now (its card's "Connect" button, or after a refused token). */
export function reconnectHa(): void {
    configureHa(current, true);
}

function apply(settings: GlobalSettings): void {
    // The PI may save global settings without the client id it doesn't know about; keep ours
    current = { ...settings, clientId: settings.clientId || current.clientId };
    configureHa(current);
    configureBroker(current);
}

function configureHa(s: GlobalSettings, force = false): void {
    ha.configure({ url: s.haUrl, token: s.haToken }, force);
}

function configureBroker(s: GlobalSettings, force = false): void {
    broker.configure({ url: s.brokerUrl, user: s.brokerUser, password: s.brokerPassword, allowSelfSigned: s.allowSelfSigned, clientId: s.clientId || newClientId() }, force);
}
