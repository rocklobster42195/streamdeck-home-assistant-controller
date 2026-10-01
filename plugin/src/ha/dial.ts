// What the Slider dial does with a Home Assistant entity, without Stream Deck: the value it shows,
// its range and step, and the service call that sets a new value. Lights, fans and covers turn in
// percent (brightness, speed, position) and switch on and off on a push; a thermostat turns its
// setpoint and shows the room temperature; number and input_number entities use HA's own range.
import type { HassEntity } from "home-assistant-js-websocket";
import { domainOf } from "./entities";

export type HaDial = {
    /** The value to show: percent, setpoint or number; undefined while HA reports none. */
    value?: number;
    /** A thermostat's measured temperature. */
    actual?: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    /** Push switches the entity on and off (lights, fans, covers). */
    toggles: boolean;
    /** The service call that sets `value`. */
    set(value: number): { domain: string; service: string; data: Record<string, unknown> };
};

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Lights that can only switch (no brightness) don't fit the dial. */
export function dimmable(e: HassEntity): boolean {
    const modes = e.attributes.supported_color_modes;
    return !Array.isArray(modes) || modes.some((m) => m !== "onoff");
}

/** The dial for an entity; undefined for domains it can't turn. */
export function haDial(e: HassEntity | undefined): HaDial | undefined {
    if (!e) return undefined;
    const domain = domainOf(e.entity_id);
    const a = e.attributes;
    switch (domain) {
        case "light": {
            const b = num(a.brightness);
            return {
                value: e.state === "off" ? 0 : b !== undefined ? Math.round((b / 255) * 100) : undefined,
                min: 0,
                max: 100,
                step: 5,
                unit: "%",
                toggles: true,
                set: (v) => (v <= 0 ? { domain, service: "turn_off", data: {} } : { domain, service: "turn_on", data: { brightness_pct: Math.round(v) } }),
            };
        }
        case "fan":
            return {
                value: e.state === "off" ? 0 : num(a.percentage),
                min: 0,
                max: 100,
                step: num(a.percentage_step) ?? 10,
                unit: "%",
                toggles: true,
                set: (v) => ({ domain, service: "set_percentage", data: { percentage: Math.round(v) } }),
            };
        case "cover":
            return {
                value: num(a.current_position),
                min: 0,
                max: 100,
                step: 5,
                unit: "%",
                toggles: true,
                set: (v) => ({ domain, service: "set_cover_position", data: { position: Math.round(v) } }),
            };
        case "climate":
            return {
                value: num(a.temperature),
                actual: num(a.current_temperature),
                min: num(a.min_temp) ?? 7,
                max: num(a.max_temp) ?? 35,
                step: num(a.target_temp_step) ?? 0.5,
                toggles: false,
                set: (v) => ({ domain, service: "set_temperature", data: { temperature: v } }),
            };
        case "number":
        case "input_number": {
            const unit = a.unit_of_measurement;
            return {
                value: num(e.state),
                min: num(a.min) ?? 0,
                max: num(a.max) ?? 100,
                step: num(a.step) ?? 1,
                unit: typeof unit === "string" ? unit : undefined,
                toggles: false,
                set: (v) => ({ domain, service: "set_value", data: { value: v } }),
            };
        }
    }
    return undefined;
}
