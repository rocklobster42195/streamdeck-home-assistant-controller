import { describe, expect, it } from "vitest";
import type { HassEntity } from "home-assistant-js-websocket";
import { haFits } from "./entities";
import { dimmable, haDial, modeCall, nextMode } from "./dial";

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({ entity_id, state, attributes, last_changed: "", last_updated: "", context: { id: "", user_id: null, parent_id: null } });

describe("HA entities on the Slider dial", () => {
    it("turns a light's brightness in percent, 0 % switches it off", () => {
        const d = haDial(entity("light.desk", "on", { brightness: 128 }))!;
        expect(d).toMatchObject({ value: 50, min: 0, max: 100, step: 5, unit: "%", toggles: true });
        expect(d.set(30)).toEqual({ domain: "light", service: "turn_on", data: { brightness_pct: 30 } });
        expect(d.set(0)).toEqual({ domain: "light", service: "turn_off", data: {} });
        expect(haDial(entity("light.desk", "off"))?.value).toBe(0);
    });

    it("keeps lights that can only switch off the dial", () => {
        const plain = entity("light.hall", "on", { supported_color_modes: ["onoff"] });
        expect(dimmable(plain)).toBe(false);
        expect(haFits("light.hall", plain)).toEqual(["switch"]);
        expect(haFits("light.desk", entity("light.desk", "on", { supported_color_modes: ["brightness"] }))).toEqual(["switch", "slider"]);
    });

    it("sets a thermostat's setpoint within HA's range and shows the room temperature", () => {
        const d = haDial(entity("climate.bath", "heat", { temperature: 21, current_temperature: 20.4, min_temp: 5, max_temp: 30, target_temp_step: 0.5 }))!;
        expect(d).toMatchObject({ value: 21, actual: 20.4, min: 5, max: 30, step: 0.5, toggles: false });
        expect(d.set(21.5)).toEqual({ domain: "climate", service: "set_temperature", data: { temperature: 21.5 } });
        expect(haFits("climate.bath")).toEqual(["slider"]);
    });

    it("steps a thermostat through its modes on a push", () => {
        const d = haDial(entity("climate.living", "off", { temperature: 4.5, current_temperature: 21, hvac_modes: ["auto", "heat", "off"] }))!;
        expect(d).toMatchObject({ modes: ["auto", "heat", "off"], off: true });
        expect(nextMode(d.modes!, "off")).toBe("auto");
        expect(nextMode(d.modes!, "auto")).toBe("heat");
        expect(nextMode(d.modes!, "dry")).toBe("auto");
        expect(nextMode([], "off")).toBeUndefined();
        expect(modeCall("heat")).toEqual({ domain: "climate", service: "set_hvac_mode", data: { hvac_mode: "heat" } });
    });

    it("moves a cover and sets a fan's speed", () => {
        expect(haDial(entity("cover.blind", "open", { current_position: 70 }))!.set(40)).toEqual({ domain: "cover", service: "set_cover_position", data: { position: 40 } });
        expect(haDial(entity("fan.ceiling", "on", { percentage: 33, percentage_step: 33.33 }))).toMatchObject({ value: 33, step: 33.33 });
    });

    it("uses a number's own range, step and unit", () => {
        const d = haDial(entity("input_number.volume", "12", { min: 0, max: 40, step: 2, unit_of_measurement: "dB" }))!;
        expect(d).toMatchObject({ value: 12, min: 0, max: 40, step: 2, unit: "dB" });
        expect(d.set(14)).toEqual({ domain: "input_number", service: "set_value", data: { value: 14 } });
        expect(haFits("number.speed")).toEqual(["slider", "value"]);
        expect(haDial(entity("sensor.temp", "21"))).toBeUndefined();
    });
});
