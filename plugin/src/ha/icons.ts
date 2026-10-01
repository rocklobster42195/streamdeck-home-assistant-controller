// Icons for HA entities on keys and in the picker: the one HA's frontend shows (see icon-rules.ts:
// set by the user, the icon attribute, or HA's tables by state and range, e.g. the weather's
// condition), else one per domain while the tables load (a scene's palette, a script, a lock, …).
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiEye, mdiFan, mdiGarage, mdiGestureTapButton, mdiLightbulb, mdiLock, mdiPalette, mdiPlaylistPlay, mdiRobot, mdiScriptText, mdiToggleSwitch, mdiWeatherPartlyCloudy } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { ha } from "./connection";
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

/**
 * HA's icon for the entity (for its state, or `state`), else its domain's; `except` domains get only
 * an icon the user set, the key keeps its own default otherwise (a lit bulb for lights).
 */
export function haIconPath(e: HassEntity | undefined, except: string[] = [], state?: string): string | undefined {
    if (!e) return undefined;
    const domain = domainOf(e.entity_id);
    if (except.includes(domain)) return mdiPath(haIcon(e));
    return mdiPath(mdiNameOf(ha.iconFor(e, state))) ?? mdiPath(haIcon(e)) ?? DOMAIN_ICONS[domain];
}

/** "mdi:weather-cloudy" → "mdiWeatherCloudy" (the kit's icon names). */
function mdiNameOf(icon: string | undefined): string | undefined {
    return icon ? haIcon({ attributes: { icon } } as unknown as HassEntity) : undefined;
}

/** For lists: always an icon. */
export function haListIcon(e: HassEntity): string {
    return haIconPath(e) ?? mdiEye;
}
