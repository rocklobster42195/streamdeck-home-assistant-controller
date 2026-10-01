// How Home Assistant picks an entity's icon, as its frontend does: an icon set on the entity in HA,
// else its "icon" attribute, else the integration's icon for the entity (by translation key), else
// the domain's (by device class). The last two can depend on the state ("cloudy" →
// mdi:weather-cloudy) or on a numeric range (battery 10 % → mdi:battery-10). The icon tables come
// from HA itself ("frontend/get_icons"), so they follow HA's updates.

/** One icon rule: a default, icons per state, icons from a value upwards. */
export type IconRule = { default?: string; state?: Record<string, string>; range?: Record<string, string> };

/** "entity_component": domain → device class ("_" for none) → rule. */
export type ComponentIcons = Record<string, Record<string, IconRule>>;
/** "entity": integration → domain → translation key → rule. */
export type EntityIcons = Record<string, Record<string, Record<string, IconRule>>>;

/** What an entity's registry entry adds (the icon the user set in HA, where the entity comes from). */
export type IconEntry = { icon?: string | null; platform?: string; translation_key?: string | null };

export type IconEntity = { entity_id: string; state: string; attributes: Record<string, unknown> };

/** The icon for a state: per state, else by range (numbers), else the default. */
export function iconFromRule(rule: IconRule | undefined, state: string | undefined): string | undefined {
    if (!rule) return undefined;
    if (state !== undefined && rule.state?.[state]) return rule.state[state];
    if (state !== undefined && rule.range && state.trim() !== "" && Number.isFinite(Number(state))) {
        const value = Number(state);
        // The highest threshold the value reaches ("0", "10", "20", … for a battery)
        let best: { at: number; icon: string } | undefined;
        for (const [at, icon] of Object.entries(rule.range)) {
            const n = Number(at);
            if (Number.isFinite(n) && n <= value && (!best || n > best.at)) best = { at: n, icon };
        }
        if (best) return best.icon;
    }
    return rule.default;
}

/**
 * The entity's icon ("mdi:weather-cloudy"), as HA's frontend shows it; `state` replaces the
 * entity's state (the Switch key asks for its on and off icons).
 */
export function resolveIcon(e: IconEntity, entry: IconEntry | undefined, component: ComponentIcons, entity: EntityIcons, state = e.state): string | undefined {
    if (entry?.icon) return entry.icon;
    const attr = e.attributes.icon;
    if (typeof attr === "string" && attr) return attr;
    const domain = e.entity_id.split(".")[0];
    if (entry?.platform && entry.translation_key) {
        const icon = iconFromRule(entity[entry.platform]?.[domain]?.[entry.translation_key], state);
        if (icon) return icon;
    }
    const dc = typeof e.attributes.device_class === "string" ? e.attributes.device_class : undefined;
    const rules = component[domain];
    return iconFromRule((dc && rules?.[dc]) || rules?._, state);
}
