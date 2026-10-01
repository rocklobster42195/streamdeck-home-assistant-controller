import { describe, expect, it } from "vitest";
import { decimalsOf, formatNumber, stepValue, toPercent } from "./slider-state";

const brightness = { min: 0, max: 254, step: 5 };
const setpoint = { min: 5, max: 30, step: 0.5 };

describe("stepValue", () => {
    it("steps and stays in the range", () => {
        expect(stepValue(100, 2, brightness)).toBe(110);
        expect(stepValue(250, 3, brightness)).toBe(254);
        expect(stepValue(3, -2, brightness)).toBe(0);
    });
    it("snaps a reported value to the step grid first", () => {
        expect(stepValue(128, 1, brightness)).toBe(135);
        expect(stepValue(21.3, 1, setpoint)).toBe(22);
        expect(stepValue(21.3, -1, setpoint)).toBe(21);
    });
    it("starts at the minimum without a value", () => {
        expect(stepValue(undefined, 1, setpoint)).toBe(5.5);
        expect(stepValue(Number.NaN, 0, brightness)).toBe(0);
    });
    it("keeps decimal steps exact", () => {
        let v = 20;
        for (let i = 0; i < 7; i++) v = stepValue(v, 1, { min: 0, max: 30, step: 0.1 });
        expect(v).toBe(20.7);
    });
});

describe("formatting", () => {
    it("knows the decimals of a step", () => {
        expect(decimalsOf(1)).toBe(0);
        expect(decimalsOf(0.5)).toBe(1);
        expect(decimalsOf(0.25)).toBe(2);
    });
    it("formats with the step's or the chosen decimals", () => {
        expect(formatNumber(21, 0.5)).toBe("21.0");
        expect(formatNumber(128, 1)).toBe("128");
        expect(formatNumber(21.456, 0.5, "2")).toBe("21.46");
    });
});

describe("toPercent", () => {
    it("maps any device range to 0–100", () => {
        expect(toPercent(128, { min: 0, max: 254 })).toBe(50);
        expect(toPercent(255, { min: 0, max: 255 })).toBe(100);
        expect(toPercent(37, { min: 0, max: 100 })).toBe(37);
        expect(toPercent(0.5, { min: 0, max: 1 })).toBe(50);
        expect(toPercent(5, { min: 5, max: 5 })).toBe(0);
    });
});
