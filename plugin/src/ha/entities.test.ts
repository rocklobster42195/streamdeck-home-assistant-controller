import { describe, expect, it } from "vitest";
import type { HassEntity } from "home-assistant-js-websocket";
import { sourceOf } from "../source";
import { haFits, haIcon, haName, haSwitchService, haAttributes, haRead, haOptions, haSelectService, haSwitchState, haTriggerService, isUnavailable } from "./entities";

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({ entity_id, state, attributes, last_changed: "", last_updated: "", context: { id: "", user_id: null, parent_id: null } });

describe("HA entities on keys", () => {
    it("fits switchable domains to the Switch key and readable ones to the Value key", () => {
        expect(haFits("light.desk")).toEqual(["switch", "slider"]);
        expect(haFits("lock.door")).toEqual(["switch"]);
        expect(haFits("sensor.temp")).toEqual(["value"]);
        expect(haFits("binary_sensor.window")).toEqual(["value"]);
        expect(haFits("scene.evening")).toEqual(["publish"]);
        expect(haFits("automation.morning")).toEqual(["publish"]);
        expect(haFits("person.boris")).toEqual([]);
    });

    it("reads on, off and unknown per domain", () => {
        expect(haSwitchState(entity("light.desk", "on"))).toBe("on");
        expect(haSwitchState(entity("switch.plug", "off"))).toBe("off");
        expect(haSwitchState(entity("lock.door", "locked"))).toBe("on");
        expect(haSwitchState(entity("lock.door", "unlocked"))).toBe("off");
        expect(haSwitchState(entity("lock.door", "jammed"))).toBe("unknown");
        expect(haSwitchState(entity("cover.garage", "open"))).toBe("on");
        expect(haSwitchState(entity("cover.garage", "closed"))).toBe("off");
        expect(haSwitchState(entity("light.desk", "unavailable"))).toBe("unknown");
        expect(haSwitchState(undefined)).toBe("unknown");
    });

    it("switches with the domain's services", () => {
        expect(haSwitchService("light.desk", true)).toEqual({ domain: "light", service: "turn_on" });
        expect(haSwitchService("input_boolean.guest", false)).toEqual({ domain: "input_boolean", service: "turn_off" });
        expect(haSwitchService("lock.door", true)).toEqual({ domain: "lock", service: "lock" });
        expect(haSwitchService("cover.garage", false)).toEqual({ domain: "cover", service: "close_cover" });
        expect(haSwitchService("sensor.temp", true)).toBeUndefined();
    });

    it("runs scenes, scripts, buttons and automations once", () => {
        expect(haTriggerService("scene.evening")).toEqual({ domain: "scene", service: "turn_on" });
        expect(haTriggerService("script.goodnight")).toEqual({ domain: "script", service: "turn_on" });
        expect(haTriggerService("button.restart")).toEqual({ domain: "button", service: "press" });
        expect(haTriggerService("input_button.bell")).toEqual({ domain: "input_button", service: "press" });
        expect(haTriggerService("automation.morning")).toEqual({ domain: "automation", service: "trigger" });
        expect(haTriggerService("light.desk")).toBeUndefined();
    });

    it("steps through a select's options", () => {
        expect(haFits("select.heating_mode")).toEqual(["multi-state", "value"]);
        expect(haFits("input_select.scene_list")).toEqual(["multi-state", "value"]);
        expect(haOptions(entity("select.heating_mode", "eco", { options: ["comfort", "eco", "off"] }))).toEqual(["comfort", "eco", "off"]);
        expect(haOptions(entity("select.x", "a"))).toEqual([]);
        expect(haSelectService("input_select.scene_list", "Kino")).toEqual({ domain: "input_select", service: "select_option", data: { option: "Kino" } });
        expect(haSelectService("light.desk", "on")).toBeUndefined();
    });

    it("shows the value with HA's unit, nothing while unavailable", () => {
        expect(haRead(entity("sensor.temp", "21.4", { unit_of_measurement: "°C" }))).toEqual({ payload: "21.4", unit: "°C" });
        expect(haRead(entity("binary_sensor.window", "off"))).toEqual({ payload: "off", unit: undefined });
        expect(haRead(entity("sensor.temp", "unavailable"))).toEqual({});
        expect(haRead(entity("sensor.temp", "unknown"))).toEqual({});
        expect(isUnavailable(entity("sensor.temp", "unavailable"))).toBe(true);
        expect(isUnavailable(undefined)).toBe(true);
    });

    it("reads attributes, brightness as percent", () => {
        const light = entity("light.desk", "on", { brightness: 128, color_mode: "brightness", friendly_name: "Desk", rgb_color: [1, 2, 3] });
        expect(haRead(light, "brightness")).toEqual({ payload: "50", unit: "%" });
        expect(haRead(entity("climate.bath", "heat", { current_temperature: 21.5 }), "current_temperature")).toEqual({ payload: "21.5" });
        expect(haRead(light, "rgb_color")).toEqual({});
        expect(haRead(light, "missing")).toEqual({});
        expect(haAttributes(light)).toEqual([{ name: "brightness", value: "128" }]);
    });

    it("takes name and icon from HA", () => {
        const e = entity("light.desk", "on", { friendly_name: "Desk lamp", icon: "mdi:desk-lamp" });
        expect(haName(e)).toBe("Desk lamp");
        expect(haIcon(e)).toBe("mdiDeskLamp");
        expect(haName(entity("light.x", "on"))).toBeUndefined();
    });
});

describe("sourceOf", () => {
    it("keeps the chosen source", () => {
        expect(sourceOf({ source: "mqtt" }, true)).toBe("mqtt");
        expect(sourceOf({ source: "ha" }, false)).toBe("ha");
    });

    it("keeps keys with topics on MQTT and starts new keys with HA when it is set up", () => {
        expect(sourceOf({ stateTopic: "zigbee2mqtt/lamp" }, true)).toBe("mqtt");
        expect(sourceOf({ topic: "cmnd/x" }, true)).toBe("mqtt");
        expect(sourceOf({}, true)).toBe("ha");
        expect(sourceOf({}, false)).toBe("mqtt");
    });
});
