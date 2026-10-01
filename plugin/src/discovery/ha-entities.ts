// Home Assistant entities from discovery configs, and the MQ-C actions they fit: switch/light →
// Switch, sensor/binary_sensor → Value, button/scene → Publish, select → Multi-state, number,
// light brightness and climate → Slider. settingsFor() turns an entity into an action's settings.
import { availabilityTopic, expandConfig, fieldFromTemplate, mdiName, num, str, templateFromHa, type HaConfig } from "./ha-config";

export type ActionKind = "switch" | "value" | "publish" | "multi-state" | "slider";

export type HaEntity = {
    /** Stable id: the unique id, or the config topic. */
    id: string;
    component: string;
    /** The entity's own name ("Brightness"); the device's name when the entity has none. */
    name: string;
    device?: string;
    /** "config" / "diagnostic" entities are listed after the main ones. */
    category?: string;
    icon?: string;
    config: HaConfig;
};

const COMPONENTS = new Set(["switch", "light", "sensor", "binary_sensor", "button", "scene", "select", "number", "climate"]);

/** The entity a config topic announces; undefined for removed configs and components MQ-C can't use. */
export function parseDiscovery(topic: string, payload: string): HaEntity | undefined {
    const parts = topic.split("/");
    const component = parts[1];
    if (!COMPONENTS.has(component) || !payload.trim()) return undefined;
    let raw: unknown;
    try {
        raw = JSON.parse(payload);
    } catch {
        return undefined;
    }
    if (!raw || typeof raw !== "object") return undefined;
    const c = expandConfig(raw as Record<string, unknown>);
    const device = c.device && typeof c.device === "object" ? str((c.device as Record<string, unknown>).name) : undefined;
    const name = str(c.name) ?? device ?? str(c.object_id) ?? parts[parts.length - 2];
    return { id: str(c.unique_id) ?? topic, component, name, device, category: str(c.entity_category), icon: mdiName(c.icon), config: c };
}

/** The actions an entity fits, the best one first. */
export function fits(e: HaEntity): ActionKind[] {
    const c = e.config;
    switch (e.component) {
        case "switch":
            return ["switch"];
        case "light":
            return c.brightness === true || str(c.brightness_command_topic) ? ["switch", "slider"] : ["switch"];
        case "sensor":
        case "binary_sensor":
            return ["value"];
        case "button":
        case "scene":
            return ["publish"];
        case "select":
            return ["multi-state"];
        case "number":
        case "climate":
            return ["slider"];
    }
    return [];
}

/** The settings an action gets from an entity (only the keys it needs; the rest stays as it is). */
export function settingsFor(e: HaEntity, kind: ActionKind): Record<string, unknown> {
    const c = e.config;
    const common = { availabilityTopic: availabilityTopic(c) ?? "", label: e.name, haEntity: e.id };
    const json = c.schema === "json";
    switch (kind) {
        case "switch": {
            if (e.component === "light") {
                return {
                    ...common,
                    stateTopic: str(c.state_topic) ?? "",
                    commandTopic: str(c.command_topic) ?? "",
                    field: json ? "state" : (fieldFromTemplate(c.state_value_template) ?? ""),
                    template: json ? '{"state":"{value}"}' : "",
                    onValue: json ? "ON" : (str(c.payload_on) ?? "ON"),
                    offValue: json ? "OFF" : (str(c.payload_off) ?? "OFF"),
                    commandOn: "",
                    commandOff: "",
                    ...(e.icon ? { iconOn: e.icon, iconOff: e.icon } : {}),
                };
            }
            const on = str(c.state_on) ?? str(c.payload_on) ?? "ON";
            const off = str(c.state_off) ?? str(c.payload_off) ?? "OFF";
            return {
                ...common,
                stateTopic: str(c.state_topic) ?? "",
                commandTopic: str(c.command_topic) ?? "",
                field: fieldFromTemplate(c.value_template) ?? "",
                template: templateFromHa(c.command_template) ?? "",
                onValue: on,
                offValue: off,
                commandOn: str(c.payload_on) && c.payload_on !== on ? (c.payload_on as string) : "",
                commandOff: str(c.payload_off) && c.payload_off !== off ? (c.payload_off as string) : "",
                ...(e.icon ? { iconOn: e.icon, iconOff: e.icon } : {}),
            };
        }
        case "value":
            return {
                ...common,
                stateTopic: str(c.state_topic) ?? "",
                field: fieldFromTemplate(c.value_template) ?? "",
                unit: str(c.unit_of_measurement) ?? "",
                ...(e.icon ? { icon: e.icon } : {}),
            };
        case "publish":
            return {
                ...common,
                topic: str(c.command_topic) ?? "",
                payload: e.component === "button" ? (str(c.payload_press) ?? "PRESS") : (str(c.payload_on) ?? "ON"),
                ...(e.icon ? { icon: e.icon } : {}),
            };
        case "multi-state": {
            const options = Array.isArray(c.options) ? c.options.filter((o): o is string => typeof o === "string") : [];
            return {
                ...common,
                stateTopic: str(c.state_topic) ?? "",
                commandTopic: str(c.command_topic) ?? "",
                field: fieldFromTemplate(c.value_template) ?? "",
                template: templateFromHa(c.command_template) ?? "",
                states: options.map((value, i) => ({ value, color: PALETTE[i % PALETTE.length], ...(e.icon ? { icon: e.icon } : {}) })),
            };
        }
        case "slider":
            return { ...common, ...sliderSettings(e), ...(e.icon ? { icon: e.icon } : {}) };
    }
}

const PALETTE = ["#F7A600", "#3ddc84", "#6cc4ff", "#ff4d4d", "#E14190", "#f5c542"];

function sliderSettings(e: HaEntity): Record<string, unknown> {
    const c = e.config;
    if (e.component === "climate") {
        const unit = str(c.temperature_unit) === "F" ? "°F" : "°C";
        return {
            stateTopic: str(c.temperature_state_topic) ?? "",
            field: fieldFromTemplate(c.temperature_state_template) ?? "",
            commandTopic: str(c.temperature_command_topic) ?? "",
            template: templateFromHa(c.temperature_command_template) ?? "",
            min: String(num(c.min_temp) ?? 7),
            max: String(num(c.max_temp) ?? 35),
            step: String(num(c.temp_step) ?? num(c.precision) ?? 0.5),
            unit,
            actualTopic: str(c.current_temperature_topic) ?? "",
            actualField: fieldFromTemplate(c.current_temperature_template) ?? "",
            look: "half",
            percent: false,
        };
    }
    if (e.component === "light") {
        const json = c.schema === "json";
        const max = num(c.brightness_scale) ?? 255;
        return {
            stateTopic: json ? (str(c.state_topic) ?? "") : (str(c.brightness_state_topic) ?? ""),
            field: json ? "brightness" : (fieldFromTemplate(c.brightness_value_template) ?? ""),
            commandTopic: json ? (str(c.command_topic) ?? "") : (str(c.brightness_command_topic) ?? ""),
            template: json ? '{"brightness":{value}}' : (templateFromHa(c.brightness_command_template) ?? ""),
            min: "0",
            max: String(max),
            step: String(Math.max(1, Math.round(max / 25))),
            unit: "",
            percent: true,
            actualTopic: "",
            // Push switches the light on and off
            pressAction: "toggle",
            pressStateTopic: str(c.state_topic) ?? "",
            pressCommandTopic: str(c.command_topic) ?? "",
            pressField: json ? "state" : (fieldFromTemplate(c.state_value_template) ?? ""),
            pressTemplate: json ? '{"state":"{value}"}' : "",
            pressOnValue: json ? "" : (str(c.payload_on) ?? ""),
            pressOffValue: json ? "" : (str(c.payload_off) ?? ""),
        };
    }
    // number
    return {
        stateTopic: str(c.state_topic) ?? "",
        field: fieldFromTemplate(c.value_template) ?? "",
        commandTopic: str(c.command_topic) ?? "",
        template: templateFromHa(c.command_template) ?? "",
        min: String(num(c.min) ?? 0),
        max: String(num(c.max) ?? 100),
        step: String(num(c.step) ?? 1),
        unit: str(c.unit_of_measurement) ?? "",
        percent: false,
        actualTopic: "",
    };
}
