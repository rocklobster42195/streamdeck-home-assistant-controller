import { afterEach, describe, expect, it, vi } from "vitest";
import type { HassEntity } from "home-assistant-js-websocket";
import { Accelerator } from "./acceleration";
import { DialMode } from "./dial-mode";
import { activeEffect, effectCall, hueColor, isSnapshot, levelCall, levelSpec, lightLevels, lightSnapshot, snapshotCall } from "./light";

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({ entity_id, state, attributes, last_changed: "", last_updated: "", context: { id: "", user_id: null, parent_id: null } });

const full = entity("light.desk", "on", {
    supported_color_modes: ["color_temp", "hs"],
    color_mode: "color_temp",
    brightness: 128,
    color_temp_kelvin: 3000,
    min_color_temp_kelvin: 2200,
    max_color_temp_kelvin: 6500,
    hs_color: [30, 60],
    effect_list: ["None", "Rainbow"],
    effect: "None",
});

describe("light levels", () => {
    it("offers only what the lamp can do", () => {
        expect(lightLevels(full)).toEqual(["kelvin", "hue", "saturation", "effect"]);
        expect(lightLevels(entity("light.a", "on", { supported_color_modes: ["color_temp"] }))).toEqual(["kelvin"]);
        expect(lightLevels(entity("light.b", "on", { supported_color_modes: ["brightness"] }))).toEqual([]);
        expect(lightLevels(entity("switch.c", "on"))).toEqual([]);
        expect(lightLevels(undefined)).toEqual([]);
    });

    it("takes the range and value from the lamp", () => {
        expect(levelSpec(full, "kelvin")).toMatchObject({ min: 2200, max: 6500, step: 100, unit: "K", value: 3000 });
        expect(levelSpec(full, "hue")).toMatchObject({ min: 0, max: 360, value: 30 });
        expect(levelSpec(full, "saturation")).toMatchObject({ min: 0, max: 100, value: 60 });
        expect(levelSpec(full, "effect")).toBeUndefined();
        expect(levelSpec(entity("light.a", "on", { supported_color_modes: ["color_temp"] }), "hue")).toBeUndefined();
    });

    it("sets a level, hue and saturation keeping the other half", () => {
        expect(levelCall("kelvin", 2700.4)).toEqual({ domain: "light", service: "turn_on", data: { color_temp_kelvin: 2700 } });
        expect(levelCall("hue", 120, [30, 60])?.data).toEqual({ hs_color: [120, 60] });
        expect(levelCall("saturation", 40, [30, 60])?.data).toEqual({ hs_color: [30, 40] });
        expect(levelCall("effect", 1)).toBeUndefined();
        expect(effectCall("Rainbow").data).toEqual({ effect: "Rainbow" });
    });

    it("tells no effect from a running one", () => {
        expect(activeEffect(full)).toBeUndefined();
        expect(activeEffect(entity("light.a", "on", { effect: "Rainbow" }))).toBe("Rainbow");
    });

    it("computes the hue's colour", () => {
        expect(hueColor(0)).toBe("#ff0000");
        expect(hueColor(120)).toBe("#00ff00");
        expect(hueColor(240)).toBe("#0000ff");
        expect(hueColor(-120)).toBe("#0000ff");
    });
});

describe("light preset", () => {
    it("keeps the colour temperature while the lamp shows it", () => {
        expect(lightSnapshot(full)).toEqual({ on: true, brightness: 50, kelvin: 3000 });
    });

    it("keeps the colour while the lamp shows it, and a running effect", () => {
        const colour = entity("light.desk", "on", { ...full.attributes, color_mode: "hs", effect: "Rainbow" });
        expect(lightSnapshot(colour)).toEqual({ on: true, brightness: 50, hs: [30, 60], effect: "Rainbow" });
    });

    it("keeps only 'off' for a lamp that is off", () => {
        expect(lightSnapshot(entity("light.desk", "off", full.attributes))).toEqual({ on: false });
        expect(lightSnapshot(entity("switch.a", "on"))).toBeUndefined();
    });

    it("puts the lamp back", () => {
        expect(snapshotCall({ on: false })).toEqual({ domain: "light", service: "turn_off", data: {} });
        expect(snapshotCall({ on: true, brightness: 50, kelvin: 3000 }).data).toEqual({ brightness_pct: 50, color_temp_kelvin: 3000 });
        expect(snapshotCall({ on: true, hs: [30, 60], effect: "Rainbow" }).data).toEqual({ hs_color: [30, 60], effect: "Rainbow" });
    });

    it("recognises a stored snapshot", () => {
        expect(isSnapshot({ on: true })).toBe(true);
        expect(isSnapshot(null)).toBe(false);
        expect(isSnapshot({ brightness: 5 })).toBe(false);
    });
});

describe("dial mode", () => {
    afterEach(() => vi.useRealTimers());

    it("steps through the levels and back", () => {
        const changed = vi.fn();
        const m = new DialMode<string>(changed);
        expect(m.enter()).toBe(false);
        m.setLevels(["a", "b"]);
        expect(m.active).toBeUndefined();
        expect(m.enter()).toBe(true);
        expect(m.active).toBe("a");
        m.next();
        expect(m.active).toBe("b");
        m.next();
        expect(m.active).toBe("a");
        m.back();
        expect(m.open).toBe(false);
        expect(m.active).toBeUndefined();
        expect(changed).toHaveBeenCalledTimes(4);
        m.dispose();
    });

    it("goes back by itself without input, input starts the timeout again", () => {
        vi.useFakeTimers();
        const m = new DialMode<string>(() => {}, 10_000);
        m.setLevels(["a", "b"]);
        m.enter();
        vi.advanceTimersByTime(9_000);
        m.touch();
        vi.advanceTimersByTime(9_000);
        expect(m.open).toBe(true);
        vi.advanceTimersByTime(1_500);
        expect(m.open).toBe(false);
    });

    it("keeps the active level when the list changes, and closes when it empties", () => {
        const m = new DialMode<string>(() => {});
        m.setLevels(["a", "b", "c"]);
        m.enter();
        m.next();
        m.setLevels(["a", "b"]);
        expect(m.active).toBe("b");
        m.setLevels([]);
        expect(m.open).toBe(false);
        m.dispose();
    });
});

describe("dial acceleration", () => {
    const at = (times: number[]) => {
        let i = 0;
        return () => times[Math.min(i++, times.length - 1)];
    };

    it("keeps single notches exact", () => {
        const a = new Accelerator(4, 150, 3, at([0, 1000, 2000]));
        expect([a.apply(1), a.apply(1), a.apply(1)]).toEqual([1, 1, 1]);
    });

    it("grows with a fast spin up to the limit", () => {
        const a = new Accelerator(3, 150, 3, at([0, 50, 100, 150, 200, 250, 300, 350, 400, 450]));
        const steps = Array.from({ length: 10 }, () => a.apply(1));
        expect(steps).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 3]);
    });

    it("starts over after a pause or in the other direction", () => {
        const a = new Accelerator(4, 150, 1, at([0, 50, 100, 150, 600, 650, 700]));
        expect([a.apply(1), a.apply(1), a.apply(1)]).toEqual([1, 2, 3]);
        expect(a.apply(-1)).toBe(-1);
        expect(a.apply(-1)).toBe(-1);
        expect(a.apply(-1)).toBe(-2);
        expect(a.apply(-1)).toBe(-3);
    });

    it("counts several notches in one event", () => {
        const a = new Accelerator(5, 150, 3, at([0, 50]));
        a.apply(1);
        expect(a.apply(3)).toBe(6);
        expect(a.apply(0)).toBe(0);
    });
});
