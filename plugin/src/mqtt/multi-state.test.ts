import { describe, expect, it } from "vitest";
import { nextIndex, stateCommand, stateIndex, stateOptions } from "./multi-state";

const fan = stateOptions([{ value: "off" }, { value: "1", label: "Low" }, { value: "2" }, { value: "3", label: "High" }]);

describe("multi-state", () => {
    it("keeps only rows with a value", () => {
        expect(stateOptions([{ value: " a " }, { value: "" }, { label: "x" }, null, "b"])).toEqual([{ value: "a", label: undefined, icon: undefined, color: undefined }]);
        expect(stateOptions(undefined)).toEqual([]);
    });
    it("finds the reported state, also in JSON and without case", () => {
        expect(stateIndex(fan, "2")).toBe(2);
        expect(stateIndex(fan, "OFF")).toBe(0);
        expect(stateIndex(fan, '{"fan_mode":"3"}', "fan_mode")).toBe(3);
        expect(stateIndex(fan, "4")).toBe(-1);
        expect(stateIndex(fan, undefined)).toBe(-1);
    });
    it("cycles and starts at the first when unknown", () => {
        expect(nextIndex(0, 4)).toBe(1);
        expect(nextIndex(3, 4)).toBe(0);
        expect(nextIndex(-1, 4)).toBe(0);
        expect(nextIndex(-1, 0)).toBe(-1);
    });
    it("builds the command with the template", () => {
        expect(stateCommand({ stateTopic: "z/fan", commandTopic: "z/fan/set", template: '{"fan_mode":"{value}"}' }, fan[1])).toEqual({ topic: "z/fan/set", payload: '{"fan_mode":"1"}' });
        expect(stateCommand({ stateTopic: "f" }, fan[0])).toEqual({ topic: "f", payload: "off" });
        expect(stateCommand({}, fan[0])).toBeUndefined();
    });
});
