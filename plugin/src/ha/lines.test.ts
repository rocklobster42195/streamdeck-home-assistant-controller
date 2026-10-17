import { describe, expect, it } from "vitest";
import { optionalLine, STATE_ATTRIBUTE } from "./lines";

describe("optionalLine", () => {
    it("is off with nothing set", () => {
        expect(optionalLine(undefined, undefined).on).toBe(false);
        expect(optionalLine("", " ").on).toBe(false);
    });

    it("shows the state of the same entity when chosen", () => {
        expect(optionalLine(STATE_ATTRIBUTE, "")).toEqual({ on: true, attribute: undefined });
    });

    it("shows an attribute, or the state of another entity", () => {
        expect(optionalLine("humidity", "")).toEqual({ on: true, attribute: "humidity" });
        expect(optionalLine("", "sensor.x")).toEqual({ on: true, attribute: undefined });
        expect(optionalLine("humidity", "sensor.x")).toEqual({ on: true, attribute: "humidity" });
    });
});
