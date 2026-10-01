// Shapes follow real discovery configs (zigbee2mqtt, AWTRIX with abbreviations, JSA); names invented.
import { describe, expect, it } from "vitest";
import { availabilityTopic, expandConfig, fieldFromTemplate, mdiName, templateFromHa } from "./ha-config";
import { fits, parseDiscovery, settingsFor } from "./ha-entities";

const z2mAvail = [
    { topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}" },
    { topic: "zigbee2mqtt/Flurlicht/availability", value_template: "{{ value_json.state }}" },
];
const jsonLight = JSON.stringify({
    availability: z2mAvail,
    brightness: true,
    brightness_scale: 254,
    command_topic: "zigbee2mqtt/Flurlicht/set",
    device: { identifiers: ["zigbee2mqtt_0x01"], manufacturer: "Philips", model: "Hue white", name: "Flurlicht" },
    name: null,
    schema: "json",
    state_topic: "zigbee2mqtt/Flurlicht",
    unique_id: "0x01_light_zigbee2mqtt",
});
const awtrix = JSON.stringify({
    name: "Matrix",
    uniq_id: "abc_mat",
    ic: "mdi:clock-digital",
    "~": "awtrix_1/abc",
    stat_t: "~/mat/stat_t",
    cmd_t: "~/mat/cmd_t",
    avty_t: "~/avty_t",
    dev: { ids: "abc", name: "awtrix_1", mf: "Blueforcer" },
});

describe("ha-config", () => {
    it("expands abbreviations and the base topic", () => {
        const c = expandConfig(JSON.parse(awtrix));
        expect(c.state_topic).toBe("awtrix_1/abc/mat/stat_t");
        expect(c.availability_topic).toBe("awtrix_1/abc/avty_t");
        expect(c.icon).toBe("mdi:clock-digital");
        expect((c.device as Record<string, unknown>).manufacturer).toBe("Blueforcer");
    });
    it("reads fields from value templates", () => {
        expect(fieldFromTemplate("{{ value_json.state }}")).toBe("state");
        expect(fieldFromTemplate('{{ value_json["battery"] }}')).toBe("battery");
        expect(fieldFromTemplate("{{ value_json['update']['latest_version'] }}")).toBe("update.latest_version");
        expect(fieldFromTemplate("{{ value_json.permit_join | lower }}")).toBe("permit_join");
        expect(fieldFromTemplate(`{{ value_json["ip_address"] | default('',True) | string | truncate(254, True, '', 0) }}`)).toBe("ip_address");
        expect(fieldFromTemplate('{% if value_json["led_indication"] %}true{% else %}false{% endif %}')).toBe("led_indication");
        expect(fieldFromTemplate("{{ value_json.a if value_json.b else 0 }}")).toBeUndefined();
        expect(fieldFromTemplate("{{ now().strftime('%Y') }}")).toBeUndefined();
        expect(fieldFromTemplate(undefined)).toBeUndefined();
    });
    it("turns command templates into MQ-C templates", () => {
        expect(templateFromHa('{"options": {"log_level": "{{ value }}"}}')).toBe('{"options": {"log_level": "{value}"}}');
        expect(templateFromHa("{{ value | int }}")).toBeUndefined();
    });
    it("takes the device's own availability topic", () => {
        expect(availabilityTopic({ availability: z2mAvail })).toBe("zigbee2mqtt/Flurlicht/availability");
        expect(availabilityTopic({ availability_topic: "x/avty" })).toBe("x/avty");
    });
    it("converts icon names", () => {
        expect(mdiName("mdi:battery-charging")).toBe("mdiBatteryCharging");
        expect(mdiName("hass:x")).toBeUndefined();
    });
});

describe("ha-entities", () => {
    it("names an entity without a name after its device", () => {
        const e = parseDiscovery("homeassistant/light/0x01/light/config", jsonLight)!;
        expect(e).toMatchObject({ component: "light", name: "Flurlicht", device: "Flurlicht", id: "0x01_light_zigbee2mqtt" });
        expect(fits(e)).toEqual(["switch", "slider"]);
    });
    it("ignores removed configs and unusable components", () => {
        expect(parseDiscovery("homeassistant/light/x/config", "")).toBeUndefined();
        expect(parseDiscovery("homeassistant/update/x/config", "{}")).toBeUndefined();
        expect(parseDiscovery("homeassistant/sensor/x/config", "not json")).toBeUndefined();
    });
    it("sets up a Switch for a JSON light", () => {
        const s = settingsFor(parseDiscovery("homeassistant/light/0x01/light/config", jsonLight)!, "switch");
        expect(s).toMatchObject({ stateTopic: "zigbee2mqtt/Flurlicht", commandTopic: "zigbee2mqtt/Flurlicht/set", field: "state", template: '{"state":"{value}"}', availabilityTopic: "zigbee2mqtt/Flurlicht/availability", label: "Flurlicht" });
    });
    it("sets up a Slider for its brightness, in percent, push switching", () => {
        const s = settingsFor(parseDiscovery("homeassistant/light/0x01/light/config", jsonLight)!, "slider");
        expect(s).toMatchObject({ field: "brightness", template: '{"brightness":{value}}', max: "254", percent: true, pressAction: "toggle", pressField: "state", pressTemplate: '{"state":"{value}"}' });
    });
    it("keeps a switch's reported and sent values apart (z2m permit join)", () => {
        const e = parseDiscovery(
            "homeassistant/switch/bridge/permit_join/config",
            JSON.stringify({ name: "Permit join", state_topic: "zigbee2mqtt/bridge/info", value_template: "{{ value_json.permit_join | lower }}", command_topic: "zigbee2mqtt/bridge/request/permit_join", payload_on: '{"time": 254}', payload_off: '{"time": 0}', state_on: "true", state_off: "false", icon: "mdi:human-greeting-proximity" }),
        )!;
        expect(settingsFor(e, "switch")).toMatchObject({ field: "permit_join", onValue: "true", offValue: "false", commandOn: '{"time": 254}', commandOff: '{"time": 0}', iconOn: "mdiHumanGreetingProximity" });
    });
    it("sets up Value, Publish and Multi-state", () => {
        const sensor = parseDiscovery("homeassistant/sensor/0x02/temperature/config", JSON.stringify({ name: "Temperatur", state_topic: "zigbee2mqtt/Klima", value_template: "{{ value_json.temperature }}", unit_of_measurement: "°C" }))!;
        expect(settingsFor(sensor, "value")).toMatchObject({ stateTopic: "zigbee2mqtt/Klima", field: "temperature", unit: "°C", label: "Temperatur" });
        const scene = parseDiscovery("homeassistant/scene/g/scene_0/config", JSON.stringify({ name: "Abend", command_topic: "zigbee2mqtt/Gruppe/set", payload_on: '{ "scene_recall": 0 }' }))!;
        expect(settingsFor(scene, "publish")).toMatchObject({ topic: "zigbee2mqtt/Gruppe/set", payload: '{ "scene_recall": 0 }' });
        const button = parseDiscovery("homeassistant/button/k/sync/config", JSON.stringify({ name: "Sync", command_topic: "jsa/button/sync/set" }))!;
        expect(settingsFor(button, "publish")).toMatchObject({ payload: "PRESS" });
        const select = parseDiscovery("homeassistant/select/k/type/config", JSON.stringify({ name: "Typ", state_topic: "jsa/select/t/data", value_template: "{{ value_json.state }}", command_topic: "jsa/select/t/set", options: ["Alkaline", "NiMH"] }))!;
        const ms = settingsFor(select, "multi-state");
        expect(ms).toMatchObject({ field: "state", commandTopic: "jsa/select/t/set" });
        expect((ms.states as { value: string }[]).map((o) => o.value)).toEqual(["Alkaline", "NiMH"]);
    });
    it("sets up a thermostat on the Slider", () => {
        const e = parseDiscovery(
            "homeassistant/climate/t/config",
            JSON.stringify({ name: "Bad", temp_stat_t: "home/bad/target", temp_cmd_t: "home/bad/target/set", curr_temp_t: "home/bad/temp", min_temp: 10, max_temp: 28, temp_step: 0.5 }),
        )!;
        expect(fits(e)).toEqual(["slider"]);
        expect(settingsFor(e, "slider")).toMatchObject({ stateTopic: "home/bad/target", commandTopic: "home/bad/target/set", actualTopic: "home/bad/temp", min: "10", max: "28", step: "0.5", unit: "°C" });
    });
});
