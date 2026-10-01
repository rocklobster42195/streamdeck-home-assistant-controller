import { describe, expect, it } from "vitest";
import type { HassEntity } from "home-assistant-js-websocket";
import { sourceOf } from "../source";
import { haFits, haIcon, haName, haSwitchService, haSwitchState, haValue, isUnavailable } from "./entities";

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({ entity_id, state, attributes, last_changed: "", last_updated: "", context: { id: "", user_id: null, parent_id: null } });

describe("HA entities on keys", () => {
    it("fits switchable domains to the Switch key and readable ones to the Value key", () => {
        expect(haFits("light.desk")).toEqual(["switch"]);
        expect(haFits("lock.door")).toEqual(["switch"]);
        expect(haFits("sensor.temp")).toEqual(["value"]);
        expect(haFits("binary_sensor.window")).toEqual(["value"]);
        expect(haFits("scene.evening")).toEqual([]);
        expect(haFits("automation.morning")).toEqual([]);
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

    it("shows the value with HA's unit, nothing while unavailable", () => {
        expect(haValue(entity("sensor.temp", "21.4", { unit_of_measurement: "°C" }))).toEqual({ payload: "21.4", unit: "°C" });
        expect(haValue(entity("binary_sensor.window", "off"))).toEqual({ payload: "off", unit: undefined });
        expect(haValue(entity("sensor.temp", "unavailable"))).toEqual({});
        expect(isUnavailable(entity("sensor.temp", "unavailable"))).toBe(true);
        expect(isUnavailable(undefined)).toBe(true);
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
