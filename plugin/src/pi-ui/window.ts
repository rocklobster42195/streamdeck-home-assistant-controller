// The settings window: the property inspector opens its own page again with "?window" in a bigger
// window (window.open; a page from the plugin folder, no web server). Stream Deck only connects the
// PI, so the window borrows the PI's connection through window.opener: its `sd` mirrors the PI's
// settings and messages and sends through it. The window closes with the PI (another key clicked).
// A candidate for the kit once it has settled.
import { nextRequestId, sd } from "@rocklobster42195/streamdeck-kit/pi";

type Listener = (value: unknown) => void;
/** The parts of the kit's client the mirror touches (not all of them are public). */
type Client = {
    settings: Record<string, unknown>;
    globalSettings: Record<string, unknown>;
    actionInfo: unknown;
    info: unknown;
    uuid: string;
    ready: boolean;
    listeners: { ready: Set<() => void>; settings: Set<Listener>; globalSettings: Set<Listener>; message: Set<Listener> };
    emit(kind: string, value: unknown): void;
    onSettings(fn: Listener): () => void;
    onGlobalSettings(fn: Listener): () => void;
    onMessage(fn: Listener): () => void;
    setSetting(key: string, value: unknown): void;
    setSettings(patch: Record<string, unknown>): void;
    setGlobalSetting(key: string, value: unknown): void;
    sendToPlugin(payload: Record<string, unknown>): void;
    openUrl(url: string): void;
};

const WINDOW_FEATURES = "width=780,height=860";

export function isSettingsWindow(): boolean {
    return new URLSearchParams(location.search).has("window");
}

/** In the PI: let a settings window find this page's connection. */
export function shareConnection(): void {
    (window as unknown as { hacSd: unknown }).hacSd = sd;
}

/**
 * Open this page as the settings window, scrolled to `section` (an element id). False when the
 * window can't open; the caller then shows everything inline.
 */
export function openSettingsWindow(section?: string): boolean {
    const url = `${location.pathname.split("/").pop()}?window${section ? `#${section}` : ""}`;
    let w: Window | null = null;
    try {
        w = window.open(url, `hac-settings-${(sd as unknown as Client).uuid}`, WINDOW_FEATURES);
    } catch {
        w = null;
    }
    w?.focus();
    return !!w;
}

/** In the window: make the kit's `sd` a mirror of the PI's; false when there is no PI to borrow from. */
export function mirrorOpener(): boolean {
    const remote = (window.opener as { hacSd?: Client } | null)?.hacSd;
    if (!remote) return false;
    const local = sd as unknown as Client;
    local.settings = remote.settings;
    local.globalSettings = remote.globalSettings;
    local.actionInfo = remote.actionInfo;
    local.info = remote.info;
    local.uuid = remote.uuid;
    // Everything the window changes goes through the PI, so both stay the same
    local.setSetting = (k, v) => remote.setSetting(k, v);
    local.setSettings = (patch) => remote.setSettings(patch);
    local.setGlobalSetting = (k, v) => remote.setGlobalSetting(k, v);
    local.sendToPlugin = (payload) => remote.sendToPlugin(payload);
    local.openUrl = (u) => remote.openUrl(u);
    const offs = [
        remote.onSettings((s) => {
            local.settings = s as Record<string, unknown>;
            local.emit("settings", s);
        }),
        remote.onGlobalSettings((g) => {
            local.globalSettings = g as Record<string, unknown>;
            local.emit("globalSettings", g);
        }),
        remote.onMessage((m) => local.emit("message", m)),
    ];
    // The PI's listeners would call into a closed window otherwise
    window.addEventListener("pagehide", () => offs.forEach((off) => off()));
    // Request ids come from a counter per page; keep the window's apart from the PI's
    for (let i = 0; i < 1_000_000; i++) nextRequestId();
    local.ready = true;
    for (const fn of local.listeners.ready) fn();
    local.listeners.ready.clear();
    return true;
}
