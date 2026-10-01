// How Home Assistant writes a state in the user's language, as its frontend does: the integration's
// text for the entity (by translation key), else the domain's for the device class, else the
// domain's own ("cloudy" → "Bewölkt", a door's "on" → "Geöffnet"). Without a text the state stays
// as it is. The texts come from HA itself ("frontend/get_translations"), in Stream Deck's language.
import type { IconEntity, IconEntry } from "./icon-rules";

/** HA's flat translation keys ("component.weather.entity_component._.state.cloudy") → text. */
export type StateTexts = Record<string, string>;

export function stateText(e: IconEntity, entry: IconEntry | undefined, texts: StateTexts, state = e.state): string {
    const domain = e.entity_id.split(".")[0];
    const dc = typeof e.attributes.device_class === "string" ? e.attributes.device_class : undefined;
    const keys = [
        entry?.platform && entry.translation_key ? `component.${entry.platform}.entity.${domain}.${entry.translation_key}.state.${state}` : undefined,
        dc ? `component.${domain}.entity_component.${dc}.state.${state}` : undefined,
        `component.${domain}.entity_component._.state.${state}`,
    ];
    for (const k of keys) if (k && texts[k]) return texts[k];
    return state;
}
