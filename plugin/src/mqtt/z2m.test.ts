import { describe, expect, it } from "vitest";
import { availabilityTopic } from "../discovery/ha-config";
import { deviceAvailability, stateRequest } from "./z2m";

describe("zigbee2mqtt", () => {
    it("asks only zigbee2mqtt-style devices for their state", () => {
        expect(stateRequest("zigbee2mqtt/Ikea_TV", "zigbee2mqtt/Ikea_TV/set")).toEqual({ topic: "zigbee2mqtt/Ikea_TV/get", payload: '{"state":""}' });
        expect(stateRequest("z2m/Wohnzimmer/Lampe", " z2m/Wohnzimmer/Lampe/set ")).toEqual({ topic: "z2m/Wohnzimmer/Lampe/get", payload: '{"state":""}' });
        expect(stateRequest("sonoff/0/S20/POWER", undefined)).toBeUndefined();
        expect(stateRequest("sonoff/0/S20/POWER", "sonoff/0/S20/POWER")).toBeUndefined();
        expect(stateRequest("jsa/switch/x/data", "jsa/switch/x/set")).toBeUndefined();
        expect(stateRequest("zigbee2mqtt/+", "zigbee2mqtt/+/set")).toBeUndefined();
    });

    it("uses the device's availability when discovery names only the bridge", () => {
        expect(deviceAvailability("zigbee2mqtt/bridge/state", "zigbee2mqtt/Stern")).toBe("zigbee2mqtt/Stern/availability");
        expect(deviceAvailability("zigbee2mqtt/bridge/state", "zigbee2mqtt/bridge/info")).toBe("zigbee2mqtt/bridge/state");
        expect(deviceAvailability("zigbee2mqtt/bridge/state", "other/Stern")).toBe("zigbee2mqtt/bridge/state");
        expect(deviceAvailability("tele/plug/LWT", "stat/plug/POWER")).toBe("tele/plug/LWT");
        const stern = { state_topic: "zigbee2mqtt/Stern", availability: [{ topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}" }] };
        expect(availabilityTopic(stern)).toBe("zigbee2mqtt/Stern/availability");
    });
});
