// Home Assistant MQTT discovery configs: expand the abbreviated keys and the "~" base topic, and
// read what MQ-C can use from Home Assistant's templates (a JSON field from "{{ value_json.x }}",
// "{value}" from "{{ value }}"). Anything more complex is left out rather than guessed.

const ABBREVIATIONS: Record<string, string> = {
    avty: "availability",
    avty_t: "availability_topic",
    bri_cmd_t: "brightness_command_topic",
    bri_cmd_tpl: "brightness_command_template",
    bri_scl: "brightness_scale",
    bri_stat_t: "brightness_state_topic",
    bri_val_tpl: "brightness_value_template",
    cmd_t: "command_topic",
    cmd_tpl: "command_template",
    curr_temp_t: "current_temperature_topic",
    curr_temp_tpl: "current_temperature_template",
    dev: "device",
    dev_cla: "device_class",
    ent_cat: "entity_category",
    ic: "icon",
    max_temp: "max_temp",
    min_temp: "min_temp",
    obj_id: "object_id",
    ops: "options",
    pl_avail: "payload_available",
    pl_not_avail: "payload_not_available",
    pl_off: "payload_off",
    pl_on: "payload_on",
    pl_prs: "payload_press",
    stat_off: "state_off",
    stat_on: "state_on",
    stat_t: "state_topic",
    stat_val_tpl: "state_value_template",
    temp_cmd_t: "temperature_command_topic",
    temp_cmd_tpl: "temperature_command_template",
    temp_stat_t: "temperature_state_topic",
    temp_stat_tpl: "temperature_state_template",
    temp_unit: "temperature_unit",
    uniq_id: "unique_id",
    unit_of_meas: "unit_of_measurement",
    val_tpl: "value_template",
};

const DEVICE_ABBREVIATIONS: Record<string, string> = { ids: "identifiers", mf: "manufacturer", mdl: "model", sw: "sw_version", hw: "hw_version" };

export type HaConfig = Record<string, unknown>;

/** Full key names, and "~" replaced by the base topic in every topic. */
export function expandConfig(raw: Record<string, unknown>): HaConfig {
    const out: HaConfig = {};
    for (const [k, v] of Object.entries(raw)) out[ABBREVIATIONS[k] ?? k] = v;
    if (out.device && typeof out.device === "object") {
        const d: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(out.device as Record<string, unknown>)) d[DEVICE_ABBREVIATIONS[k] ?? k] = v;
        out.device = d;
    }
    if (Array.isArray(out.availability)) out.availability = out.availability.map((a) => (a && typeof a === "object" ? { ...a, topic: (a as Record<string, unknown>).topic ?? (a as Record<string, unknown>).t } : a));
    const base = typeof out["~"] === "string" ? (out["~"] as string) : undefined;
    if (base) {
        const sub = (v: unknown) => (typeof v === "string" && (v.startsWith("~") || v.endsWith("~")) ? v.replace(/^~|~$/, base) : v);
        for (const k of Object.keys(out)) if (k.endsWith("_topic")) out[k] = sub(out[k]);
        if (Array.isArray(out.availability)) out.availability = out.availability.map((a) => (a && typeof a === "object" ? { ...a, topic: sub((a as Record<string, unknown>).topic) } : a));
    }
    return out;
}

/**
 * The JSON field a value template reads: "{{ value_json.a.b }}", "{{ value_json['a'] }}", with
 * filters ("| lower", "| default('', True) | truncate(254)"), or a plain true/false test
 * ("{% if value_json['a'] %}true{% else %}false{% endif %}").
 */
export function fieldFromTemplate(tpl: unknown): string | undefined {
    if (typeof tpl !== "string") return undefined;
    const path = String.raw`value_json((?:\.[A-Za-z_]\w*|\[\s*(?:'[^']*'|"[^"]*")\s*\])+)`;
    const filters = String.raw`(?:\|\s*\w+(?:\([^()]*\))?\s*)*`;
    const m =
        new RegExp(String.raw`^\s*\{\{\s*${path}\s*${filters}\}\}\s*$`).exec(tpl) ??
        new RegExp(String.raw`^\s*\{%\s*if\s+${path}\s*%\}\s*true\s*\{%\s*else\s*%\}\s*false\s*\{%\s*endif\s*%\}\s*$`).exec(tpl);
    if (!m) return undefined;
    const parts: string[] = [];
    const re = /\.([A-Za-z_]\w*)|\[\s*(?:'([^']*)'|"([^"]*)")\s*\]/g;
    let p: RegExpExecArray | null;
    while ((p = re.exec(m[1]))) parts.push(p[1] ?? p[2] ?? p[3]);
    return parts.join(".");
}

/** MQ-C's template from a command template: "{{ value }}" becomes "{value}"; other Jinja is not supported. */
export function templateFromHa(tpl: unknown): string | undefined {
    if (typeof tpl !== "string") return undefined;
    const t = tpl.replace(/\{\{\s*value\s*\}\}/g, "{value}");
    return /\{\{|\{%/.test(t) ? undefined : t;
}

/** The availability topic MQ-C watches: the device's own one (the last of several), or the single one. */
export function availabilityTopic(c: HaConfig): string | undefined {
    if (Array.isArray(c.availability)) {
        const topics = c.availability.map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>).topic : undefined)).filter((t): t is string => typeof t === "string");
        return topics.at(-1);
    }
    return str(c.availability_topic);
}

/** "mdi:battery-charging" → "mdiBatteryCharging" (the kit's icon names). */
export function mdiName(icon: unknown): string | undefined {
    if (typeof icon !== "string" || !icon.startsWith("mdi:")) return undefined;
    return "mdi" + icon.slice(4).split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join("");
}

export function str(v: unknown): string | undefined {
    return typeof v === "string" && v.trim() ? v : undefined;
}

export function num(v: unknown): number | undefined {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN;
    return Number.isFinite(n) ? n : undefined;
}
