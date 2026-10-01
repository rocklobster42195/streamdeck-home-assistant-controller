import { describe, expect, it } from "vitest";
import { iconFromRule, resolveIcon, type ComponentIcons, type EntityIcons } from "./icon-rules";

const component: ComponentIcons = {
    weather: { _: { default: "mdi:weather-partly-cloudy", state: { cloudy: "mdi:weather-cloudy", sunny: "mdi:weather-sunny" } } },
    sensor: {
        _: { default: "mdi:eye" },
        battery: { default: "mdi:battery-unknown", range: { "0": "mdi:battery-outline", "10": "mdi:battery-10", "90": "mdi:battery-90", "100": "mdi:battery" } },
    },
    light: { _: { default: "mdi:lightbulb", state: { off: "mdi:lightbulb-off" } } },
};
const entity: EntityIcons = { openweathermap: { sensor: { uv_index: { default: "mdi:weather-sunny" } } } };
const e = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes });

describe("HA icons", () => {
    it("follows the state", () => {
        expect(resolveIcon(e("weather.home", "cloudy"), undefined, component, entity)).toBe("mdi:weather-cloudy");
        expect(resolveIcon(e("weather.home", "sunny"), undefined, component, entity)).toBe("mdi:weather-sunny");
        expect(resolveIcon(e("weather.home", "hail"), undefined, component, entity)).toBe("mdi:weather-partly-cloudy");
    });

    it("follows numeric ranges", () => {
        const battery = (v: string) => resolveIcon(e("sensor.phone_battery", v, { device_class: "battery" }), undefined, component, entity);
        expect(battery("5")).toBe("mdi:battery-outline");
        expect(battery("14")).toBe("mdi:battery-10");
        expect(battery("100")).toBe("mdi:battery");
        expect(battery("unknown")).toBe("mdi:battery-unknown");
        expect(iconFromRule(undefined, "1")).toBeUndefined();
    });

    it("prefers the user's icon, then the attribute, then the integration's", () => {
        const uv = e("sensor.owm_uv", "0.2");
        expect(resolveIcon(uv, { platform: "openweathermap", translation_key: "uv_index" }, component, entity)).toBe("mdi:weather-sunny");
        expect(resolveIcon(e("sensor.x", "1", { icon: "mdi:flask" }), { platform: "openweathermap", translation_key: "uv_index" }, component, entity)).toBe("mdi:flask");
        expect(resolveIcon(e("sensor.x", "1", { icon: "mdi:flask" }), { icon: "mdi:glass-wine" }, component, entity)).toBe("mdi:glass-wine");
        expect(resolveIcon(e("sensor.x", "1"), undefined, component, entity)).toBe("mdi:eye");
    });

    it("answers for another state (the Switch key's off icon)", () => {
        const lamp = e("light.desk", "on");
        expect(resolveIcon(lamp, undefined, component, entity)).toBe("mdi:lightbulb");
        expect(resolveIcon(lamp, undefined, component, entity, "off")).toBe("mdi:lightbulb-off");
    });
});
