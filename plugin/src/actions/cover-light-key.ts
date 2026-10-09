// Coverlicht key: Home Assistant lamps in the cover colour of a player on the deck (see
// ../cover-light/cover-lights.ts). A press switches it on (snapshot, lamps on) or off (snapshot back).
// Keys that are on are kept in the global settings, so after a restart their lamps follow again
// even while their page isn't shown; one not seen for a day is dropped then (a deleted key).
import streamDeck, { action, SingletonAction, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { hacPlayers } from "../bus/hac-players";
import { globalSettings, saveGlobalSettings } from "../connections";
import { CoverLights, type CoverLightSettings } from "../cover-light/cover-lights";
import { ha } from "../ha/connection";
import { haDevice } from "../ha-device/device";

type Settings = CoverLightSettings & JsonObject;

/** A remembered key not shown for this long is dropped at the next start. */
const FORGET_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Last seen to the hour: switching pages doesn't write the global settings every time. */
const hour = (t: number) => Math.floor(t / HOUR_MS) * HOUR_MS;

@action({ UUID: "de.boriskemper.ha-controller.cover-light" })
export class CoverLightKey extends SingletonAction<Settings> {
    private readonly shown = new Map<string, KeyAction<Settings>>();
    /** When each key was last on a page. */
    private readonly seen = new Map<string, number>();
    private readonly lights = new CoverLights({
        board: hacPlayers,
        ha,
        draw: (id, image) => void this.shown.get(id)?.setImage(image),
        save: (id, settings) => void this.shown.get(id)?.setSettings(settings as Settings),
        onActive: () => this.activeChanged(),
    });

    /** After the global settings are read: the keys that were on go on again. */
    restore(): void {
        const now = Date.now();
        for (const [id, saved] of Object.entries(globalSettings().coverLights ?? {})) {
            if (now - saved.seen > FORGET_MS) continue;
            this.seen.set(id, saved.seen);
            this.lights.restore(id, saved.settings as CoverLightSettings);
        }
        this.activeChanged();
    }

    override onWillAppear(ev: WillAppearEvent<Settings>): void {
        if (!ev.action.isKey()) return;
        this.shown.set(ev.action.id, ev.action);
        this.seen.set(ev.action.id, Date.now());
        this.lights.show(ev.action.id, ev.payload.settings);
    }

    override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
        this.shown.delete(ev.action.id);
        this.seen.set(ev.action.id, Date.now());
        this.lights.hide(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
        if (this.shown.has(ev.action.id)) this.lights.show(ev.action.id, ev.payload.settings);
    }

    override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        try {
            await this.lights.press(ev.action.id);
        } catch (e) {
            streamDeck.logger.warn(`[cover-light] ${String(e)}`);
            await ev.action.showAlert();
        }
    }

    private activeChanged(): void {
        const active = this.lights.active();
        haDevice.setCoverLight(active.length > 0, [...new Set(active.flatMap((a) => a.settings.lamps ?? []))]);
        const saved = Object.fromEntries(active.map((a) => [a.id, { settings: a.settings as JsonObject, seen: hour(this.seen.get(a.id) ?? Date.now()) }]));
        if (JSON.stringify(saved) !== JSON.stringify(globalSettings().coverLights ?? {})) saveGlobalSettings({ coverLights: saved });
    }
}
