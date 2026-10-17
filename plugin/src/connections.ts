// The plugin's two sources, set up in Stream Deck's global settings: Home Assistant (address and
// long-lived token) and the MQTT broker (address, login, client id kept across restarts). Either
// one may stay unconfigured.
import fs from "node:fs";
import streamDeck from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { ha } from "./ha/connection";
import { configureHaDevice, haDeviceWill } from "./ha-device/device";
import { newClientId } from "./mqtt/broker";
import { protectSecret, unprotectSecret } from "./secret";
import { broker } from "./mqtt/connection";

export type GlobalSettings = {
    /** "192.168.1.20", "http://homeassistant.local:8123", "https://ha.example.org", … */
    haUrl?: string;
    /** A long-lived access token from the HA user profile. */
    haToken?: string;
    /** A proxy for Home Assistant ("proxy.company.local:8080"), with a basic-auth login if it asks for one. */
    proxyUrl?: string;
    proxyUser?: string;
    /** The proxy password encrypted for this Windows account ("dpapi1:…"); "" once removed. */
    proxyPasswordProtected?: string;
    /** The proxy password in clear text: only where it can't be encrypted (and from before it was). */
    proxyPassword?: string;
    /** "192.168.1.10", "mqtts://broker:8883", "ws://host:9001/mqtt", … */
    brokerUrl?: string;
    brokerUser?: string;
    brokerPassword?: string;
    allowSelfSigned?: boolean;
    /** Generated once ("hac-1a2b3c4d") so the broker recognises the plugin. */
    clientId?: string;
    /** "Stream Deck in Home Assistant anzeigen": the bridge device and its sensors (off by default). */
    haDevice?: boolean;
    /** Coverlicht keys that are on, so they go on after a restart (id → settings, last seen). */
    coverLights?: Record<string, { settings: JsonObject; seen: number }>;
} & JsonObject;

let current: GlobalSettings = {};
/** Whether the stored settings were read: nothing may be written before (it would replace them). */
let loaded = false;

/** Call after streamDeck.connect(): reads the settings (creating the client id once) and connects. */
export async function startConnections(): Promise<void> {
    // HA writes states in Stream Deck's language ("Bewölkt" rather than "cloudy")
    ha.language = streamDeck.info.application.language || "en";
    streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => apply(ev.settings));
    const imported = takeImport();
    const settings = { ...(await streamDeck.settings.getGlobalSettings<GlobalSettings>()), ...imported };
    if (!settings.clientId) {
        settings.clientId = newClientId();
        await streamDeck.settings.setGlobalSettings(settings);
    }
    apply(settings);
    loaded = true;
    await protectStoredPassword();
    if (Object.keys(imported).length) await streamDeck.settings.setGlobalSettings(current);
}

/** The global settings as last seen. */
export function globalSettings(): GlobalSettings {
    return current;
}

/** Stores plugin-owned global settings (the PI keeps its own fields). */
export function saveGlobalSettings(patch: Partial<GlobalSettings>): void {
    // Before the stored settings are read, writing would wipe the connections (restore() saves later)
    if (!loaded) return;
    current = { ...current, ...patch };
    void streamDeck.settings.setGlobalSettings(current);
}

/**
 * One-time import: a "settings-import.json" next to the plugin's manifest is merged into the global
 * settings at start and deleted (repairs settings that were lost).
 */
function takeImport(): Partial<GlobalSettings> {
    const file = "settings-import.json";
    if (!fs.existsSync(file)) return {};
    try {
        const patch = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<GlobalSettings>;
        streamDeck.logger.info(`[settings] imported ${Object.keys(patch).join(", ")}`);
        return patch;
    } catch (e) {
        streamDeck.logger.warn(`[settings] import failed: ${String(e)}`);
        return {};
    } finally {
        fs.rmSync(file, { force: true });
    }
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
    // The PI may save global settings without the client id it doesn't know about, or with an old
    // copy of the Coverlicht keys (only the plugin writes those): keep ours
    // The proxy password is the plugin's too (the PI sends it as a message, never as a setting)
    current = {
        ...settings,
        clientId: settings.clientId || current.clientId,
        coverLights: current.coverLights ?? settings.coverLights,
        proxyPasswordProtected: current.proxyPasswordProtected ?? settings.proxyPasswordProtected,
        proxyPassword: current.proxyPassword ?? settings.proxyPassword,
    };
    configureHa(current);
    configureBroker(current);
    if (current.clientId) configureHaDevice(!!current.haDevice, current.clientId);
}

/** Counts configureHa() calls, so a slow decryption for old settings is dropped. */
let haEpoch = 0;
/** The last password decrypted, so settings changes don't start PowerShell again. */
let decrypted: { form: string; plain: string | undefined } | undefined;

function configureHa(s: GlobalSettings, force = false): void {
    const epoch = ++haEpoch;
    const connect = (password: string | undefined) => {
        if (epoch === haEpoch) ha.configure({ url: s.haUrl, token: s.haToken, proxy: { url: s.proxyUrl, user: s.proxyUser, password } }, force);
    };
    const form = s.proxyPasswordProtected;
    if (!form) return connect(s.proxyPassword);
    if (decrypted?.form === form) return connect(decrypted.plain);
    void unprotectSecret(form).then((plain) => {
        decrypted = { form, plain };
        if (plain === undefined) streamDeck.logger.warn("[settings] proxy password can't be decrypted (saved by another account or PC?): enter it again");
        connect(plain);
    });
}

/** Encrypt a password that was saved in clear text (before encryption, or where it wasn't possible). */
async function protectStoredPassword(): Promise<void> {
    const plain = current.proxyPassword?.trim();
    if (!plain || current.proxyPasswordProtected) return;
    const form = await protectSecret(plain);
    if (!form) return;
    streamDeck.logger.info("[settings] proxy password is now stored encrypted");
    decrypted = { form, plain };
    saveGlobalSettings({ proxyPasswordProtected: form, proxyPassword: "" });
}

/** The PI's request to store (or, empty, remove) the proxy password; it never sits in a setting. */
export async function setProxyPassword(value: string): Promise<void> {
    if (!loaded) return;
    const plain = value.trim();
    if (!plain) {
        decrypted = undefined;
        saveGlobalSettings({ proxyPasswordProtected: "", proxyPassword: "" });
    } else {
        const form = await protectSecret(plain);
        decrypted = form ? { form, plain } : undefined;
        saveGlobalSettings(form ? { proxyPasswordProtected: form, proxyPassword: "" } : { proxyPasswordProtected: "", proxyPassword: plain });
    }
    configureHa(current, true);
}

/** What the PI shows of the proxy password: whether there is one, and whether it is encrypted. */
export function proxyPasswordState(): { set: boolean; encrypted: boolean } {
    const encrypted = !!current.proxyPasswordProtected;
    return { set: encrypted || !!current.proxyPassword, encrypted };
}

function configureBroker(s: GlobalSettings, force = false): void {
    const clientId = s.clientId || newClientId();
    broker.configure({ url: s.brokerUrl, user: s.brokerUser, password: s.brokerPassword, allowSelfSigned: s.allowSelfSigned, clientId, will: haDeviceWill(!!s.haDevice, clientId) }, force);
}
