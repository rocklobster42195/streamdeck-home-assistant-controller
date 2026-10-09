// Coverlicht key: Home Assistant lamps in the cover colour of a player on the deck (see
// ../cover-light/cover-lights.ts). A press switches it on (snapshot, lamps on) or off (snapshot back).
import streamDeck, { action, SingletonAction, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { hacPlayers } from "../bus/hac-players";
import { CoverLights, type CoverLightSettings } from "../cover-light/cover-lights";
import { ha } from "../ha/connection";

type Settings = CoverLightSettings & JsonObject;

@action({ UUID: "de.boriskemper.ha-controller.cover-light" })
export class CoverLightKey extends SingletonAction<Settings> {
    private readonly shown = new Map<string, KeyAction<Settings>>();
    private readonly lights = new CoverLights({
        board: hacPlayers,
        ha,
        draw: (id, image) => void this.shown.get(id)?.setImage(image),
        save: (id, settings) => void this.shown.get(id)?.setSettings(settings as Settings),
    });

    override onWillAppear(ev: WillAppearEvent<Settings>): void {
        if (!ev.action.isKey()) return;
        this.shown.set(ev.action.id, ev.action);
        this.lights.show(ev.action.id, ev.payload.settings);
    }

    override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
        this.shown.delete(ev.action.id);
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
}
