import { describe, expect, it } from "vitest";
import { fillTemplate, jsonFields, readValue, sameValue } from "./payload";
import { isUnavailable, onOffFromPayload, suggestForTopic } from "./schemes";
import { parseBrokerUrl, shortAddress } from "./url";

describe("parseBrokerUrl", () => {
    it("treats a bare host as mqtt on 1883", () => {
        expect(parseBrokerUrl("192.168.7.10")).toMatchObject({ url: "mqtt://192.168.7.10:1883", protocol: "mqtt", port: 1883 });
        expect(parseBrokerUrl(" broker.local:1884 ")?.url).toBe("mqtt://broker.local:1884");
    });
    it("keeps the scheme and fills default ports and the websocket path", () => {
        expect(parseBrokerUrl("mqtts://h")?.url).toBe("mqtts://h:8883");
        expect(parseBrokerUrl("ws://h")?.url).toBe("ws://h:9001/mqtt");
        expect(parseBrokerUrl("wss://h:443/ws")?.url).toBe("wss://h:443/ws");
    });
    it("rejects empty input and other schemes", () => {
        expect(parseBrokerUrl("")).toBeUndefined();
        expect(parseBrokerUrl("http://h")).toBeUndefined();
    });
    it("shortens the default address", () => {
        expect(shortAddress(parseBrokerUrl("h")!)).toBe("h");
        expect(shortAddress(parseBrokerUrl("mqtts://h")!)).toBe("mqtts://h:8883");
    });
});

describe("payloads", () => {
    it("reads plain text and JSON fields", () => {
        expect(readValue("ON")).toBe("ON");
        expect(readValue('{"state":"ON","color":{"x":0.31}}', "state")).toBe("ON");
        expect(readValue('{"state":"ON","color":{"x":0.31}}', "color.x")).toBe("0.31");
        expect(readValue('{"color":{"x":0.31}}', "color")).toBe('{"x":0.31}');
        expect(readValue('{"a":[5,6]}', "a.1")).toBe("6");
        expect(readValue('{"a":1}', "b")).toBeUndefined();
        expect(readValue("ON", "state")).toBeUndefined();
    });
    it("compares values without case", () => {
        expect(sameValue("on", "ON")).toBe(true);
        expect(sameValue(" true ", "TRUE")).toBe(true);
        expect(sameValue("1", "ON")).toBe(false);
        expect(sameValue(undefined, "ON")).toBe(false);
    });
    it("fills templates and keeps JSON valid", () => {
        expect(fillTemplate("", "ON")).toBe("ON");
        expect(fillTemplate('{"state":"{value}"}', "ON")).toBe('{"state":"ON"}');
        expect(fillTemplate('{"brightness":{value}}', "128")).toBe('{"brightness":128}');
        expect(fillTemplate('{"state":{value}}', "ON")).toBe('{"state":"ON"}');
        expect(fillTemplate("set {value} now", "5")).toBe("set 5 now");
    });
    it("lists JSON fields for the picker", () => {
        expect(jsonFields('{"state":"ON","color":{"x":0.31,"y":0.32}}')).toEqual([
            { path: "state", value: "ON" },
            { path: "color.x", value: "0.31" },
            { path: "color.y", value: "0.32" },
        ]);
        expect(jsonFields("ON")).toEqual([]);
    });
});

describe("topic schemes", () => {
    it("zigbee2mqtt", () => {
        expect(suggestForTopic("zigbee2mqtt/Wohnzimmer Lampe")).toEqual({
            scheme: "zigbee2mqtt",
            commandTopic: "zigbee2mqtt/Wohnzimmer Lampe/set",
            field: "state",
            onValue: "ON",
            offValue: "OFF",
            template: '{"state":"{value}"}',
            availabilityTopic: "zigbee2mqtt/Wohnzimmer Lampe/availability",
        });
        expect(suggestForTopic("zigbee2mqtt/bridge/state")?.scheme).not.toBe("zigbee2mqtt");
        expect(suggestForTopic("zigbee2mqtt/lamp/availability")).toBeUndefined();
    });
    it("Tasmota", () => {
        expect(suggestForTopic("stat/plug1/POWER")).toMatchObject({ scheme: "tasmota", commandTopic: "cmnd/plug1/POWER", availabilityTopic: "tele/plug1/LWT" });
        expect(suggestForTopic("tele/plug1/STATE")).toMatchObject({ scheme: "tasmota", commandTopic: "cmnd/plug1/POWER", field: "POWER" });
    });
    it("Shelly Gen1 and Gen2", () => {
        expect(suggestForTopic("shellies/shelly1-AB12/relay/0")).toMatchObject({ scheme: "shelly-gen1", commandTopic: "shellies/shelly1-AB12/relay/0/command", onValue: "on" });
        expect(suggestForTopic("shellyplus1-a8/status/switch:0")).toMatchObject({
            scheme: "shelly-gen2",
            commandTopic: "shellyplus1-a8/command/switch:0",
            field: "output",
            onValue: "true",
            commandOn: "on",
            availabilityTopic: "shellyplus1-a8/online",
        });
    });
    it("ESPHome", () => {
        expect(suggestForTopic("desk/switch/relay/state")).toMatchObject({ scheme: "esphome", commandTopic: "desk/switch/relay/command", availabilityTopic: "desk/status" });
        expect(suggestForTopic("desk/light/lamp/state")).toMatchObject({ field: "state", template: '{"state":"{value}"}' });
    });
    it("generic /state, with on/off from the payload", () => {
        expect(suggestForTopic("home/fan/state", "on")).toEqual({ scheme: "generic", commandTopic: "home/fan/set", onValue: "on", offValue: "off" });
        expect(suggestForTopic("home/fan")).toBeUndefined();
    });
    it("on/off from a payload", () => {
        expect(onOffFromPayload("OFF")).toEqual({ onValue: "ON", offValue: "OFF" });
        expect(onOffFromPayload("False")).toEqual({ onValue: "true", offValue: "false" });
        expect(onOffFromPayload("21.5")).toEqual({});
    });
    it("availability", () => {
        expect(isUnavailable("offline")).toBe(true);
        expect(isUnavailable('{"state":"offline"}')).toBe(true);
        expect(isUnavailable("Online")).toBe(false);
        expect(isUnavailable("false")).toBe(true);
        expect(isUnavailable(undefined)).toBe(false);
    });
});
