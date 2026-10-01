import { describe, expect, it } from "vitest";
import { stateText } from "./state-text";

const texts = {
    "component.weather.entity_component._.state.cloudy": "Bewölkt",
    "component.binary_sensor.entity_component._.state.on": "An",
    "component.binary_sensor.entity_component.door.state.on": "Geöffnet",
    "component.select.entity_component._.state.x": "–",
    "component.hue.entity.select.effect.state.candle": "Kerze",
};
const e = (entity_id: string, state: string, attributes: Record<string, unknown> = {}) => ({ entity_id, state, attributes });

describe("HA state texts", () => {
    it("writes a state as HA does: integration, device class, domain", () => {
        expect(stateText(e("weather.home", "cloudy"), undefined, texts)).toBe("Bewölkt");
        expect(stateText(e("binary_sensor.front_door", "on", { device_class: "door" }), undefined, texts)).toBe("Geöffnet");
        expect(stateText(e("binary_sensor.motion", "on", { device_class: "motion" }), undefined, texts)).toBe("An");
        expect(stateText(e("select.lamp_effect", "candle"), { platform: "hue", translation_key: "effect" }, texts)).toBe("Kerze");
    });

    it("keeps states without a text, and answers for another state", () => {
        expect(stateText(e("sensor.owm_condition", "cloudy"), { platform: "openweathermap", translation_key: "condition" }, texts)).toBe("cloudy");
        expect(stateText(e("select.lamp_effect", "none"), { platform: "hue", translation_key: "effect" }, texts, "candle")).toBe("Kerze");
    });
});
