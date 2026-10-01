import { describe, expect, it } from "vitest";
import { numberSetting, shownValue, zonesOf } from "./value-state";

describe("shownValue", () => {
    it("keeps the device's precision without decimals", () => {
        expect(shownValue("21.50")).toEqual({ text: "21.50", number: 21.5 });
        expect(shownValue('{"temperature":19.83}', "temperature")).toEqual({ text: "19.83", number: 19.83 });
    });
    it("rounds to the chosen decimals", () => {
        expect(shownValue("19.83", undefined, "1")).toEqual({ text: "19.8", number: 19.83 });
        expect(shownValue("1234.5", undefined, 0)).toEqual({ text: "1235", number: 1234.5 });
        expect(shownValue("19.83", undefined, "abc").text).toBe("19.83");
    });
    it("shows text that is no number as it is", () => {
        expect(shownValue("open")).toEqual({ text: "open" });
        expect(shownValue("12 V")).toEqual({ text: "12 V" });
    });
    it("has nothing before a value or for a missing field", () => {
        expect(shownValue(undefined)).toEqual({});
        expect(shownValue('{"a":1}', "b")).toEqual({});
        expect(shownValue("  ")).toEqual({});
    });
});

describe("zonesOf", () => {
    it("puts the base colour first and sorts the thresholds", () => {
        expect(zonesOf("#fff", [{ from: 25, color: "#f00" }, { from: 18, color: "#0f0" }])).toEqual([
            { from: -Infinity, color: "#fff" },
            { from: 18, color: "#0f0" },
            { from: 25, color: "#f00" },
        ]);
    });
    it("ignores broken rows and missing settings", () => {
        expect(zonesOf("#fff", undefined)).toHaveLength(1);
        expect(zonesOf("#fff", [{ from: "x", color: "#f00" }, null])).toHaveLength(1);
    });
});

describe("numberSetting", () => {
    it("falls back for empty and broken values", () => {
        expect(numberSetting("", 5)).toBe(5);
        expect(numberSetting(undefined, 5)).toBe(5);
        expect(numberSetting("abc", 5)).toBe(5);
        expect(numberSetting("0", 5)).toBe(0);
        expect(numberSetting("-10.5", 5)).toBe(-10.5);
    });
});
