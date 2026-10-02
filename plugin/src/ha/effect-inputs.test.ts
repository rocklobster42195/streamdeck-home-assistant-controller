import type { HassEntity } from "home-assistant-js-websocket";
import { describe, expect, it } from "vitest";
import { haEffectColor, haEffectNumber, noEffectColor } from "./effect-inputs";

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity =>
    ({ entity_id, state, attributes, context: { id: "", parent_id: null, user_id: null }, last_changed: "", last_updated: "" }) as HassEntity;

describe("Panorama effect inputs from HA", () => {
    it("takes a light's colour, a text helper's state or an attribute", () => {
        expect(haEffectColor(entity("light.desk", "on", { rgb_color: [255, 136, 0] }))).toBe("#FF8800");
        expect(haEffectColor(entity("light.desk", "on", { hs_color: [0, 100] }))).toBe("#FF0000");
        expect(haEffectColor(entity("light.desk", "off", {}))).toBeUndefined();
        expect(haEffectColor(entity("input_text.panorama", "#00ff00"))).toBe("#00FF00");
        expect(haEffectColor(entity("input_text.panorama", "rot"))).toBe("#FF0000");
        expect(haEffectColor(entity("sensor.x", "1", { colour: "0,0,255" }), "colour")).toBe("#0000FF");
        expect(noEffectColor(" Keine ")).toBe(true);
        expect(noEffectColor("")).toBe(false);
    });

    it("maps a number onto the effect's speed: own range, the helper's, else 0–100", () => {
        // boing-ball: savedSpeed 1–5, step 1
        expect(haEffectNumber(entity("sensor.x", "50"), "boing-ball", "savedSpeed")).toBe(3);
        expect(haEffectNumber(entity("input_number.t", "2", { min: 0, max: 4 }), "boing-ball", "savedSpeed")).toBe(3);
        expect(haEffectNumber(entity("sensor.x", "1000"), "boing-ball", "savedSpeed", "0", "2000")).toBe(3);
        expect(haEffectNumber(entity("sensor.x", "unavailable"), "boing-ball", "savedSpeed")).toBeUndefined();
    });
});
