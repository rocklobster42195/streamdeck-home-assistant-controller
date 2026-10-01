// Icons for HA entities on keys and in the picker: HA's own icon ("mdi:…") when it has one, else
// one per domain (a scene's palette, a script, a lock, …).
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiEye, mdiFan, mdiGarage, mdiGestureTapButton, mdiLightbulb, mdiLock, mdiPalette, mdiPlaylistPlay, mdiRobot, mdiScriptText, mdiToggleSwitch, mdiWeatherPartlyCloudy } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { domainOf, haIcon } from "./entities";

const DOMAIN_ICONS: Record<string, string> = {
    light: mdiLightbulb,
    switch: mdiToggleSwitch,
    input_boolean: mdiToggleSwitch,
    fan: mdiFan,
    lock: mdiLock,
    cover: mdiGarage,
    automation: mdiRobot,
    scene: mdiPalette,
    script: mdiScriptText,
    button: mdiGestureTapButton,
    input_button: mdiGestureTapButton,
    weather: mdiWeatherPartlyCloudy,
    input_select: mdiPlaylistPlay,
    select: mdiPlaylistPlay,
};

/** HA's icon for the entity, else its domain's; `except` domains get none (the key keeps its own default). */
export function haIconPath(e: HassEntity | undefined, except: string[] = []): string | undefined {
    if (!e) return undefined;
    const domain = domainOf(e.entity_id);
    return mdiPath(haIcon(e)) ?? (except.includes(domain) ? undefined : DOMAIN_ICONS[domain]);
}

/** For lists: always an icon. */
export function haListIcon(e: HassEntity): string {
    return haIconPath(e) ?? mdiEye;
}
