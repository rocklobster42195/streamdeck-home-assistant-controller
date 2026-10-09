import { afterEach, describe, expect, it, vi } from "vitest";
import type { Player } from "@rocklobster42195/streamdeck-kit";
import { CoverLights, sceneId, type CoverLightSettings } from "./cover-lights";
import { lampColor, lampColorHex } from "./lamp-color";

function setup(lit: Record<string, string> = {}) {
    let player: Partial<Player> | undefined;
    const fns = new Set<() => void>();
    const calls: [string, string, Record<string, unknown>][] = [];
    const saved: CoverLightSettings[] = [];
    const ha = {
        state: "online",
        entities: Object.fromEntries(Object.entries(lit).map(([id, state]) => [id, { entity_id: id, state, attributes: {} }])),
        callService: async (d: string, s: string, data: Record<string, unknown>) => (calls.push([d, s, data]), true),
        onState: () => () => {},
    };
    const lights = new CoverLights({
        board: { resolve: () => (player ? ({ name: "WZ", playing: true, ...player } as Player) : undefined), onChange: (fn) => (fns.add(fn), () => fns.delete(fn)) },
        ha: ha as never,
        draw: () => {},
        save: (_id, s) => saved.push(s),
    });
    return {
        lights,
        calls,
        saved,
        ha,
        play(p: Partial<Player> | undefined) {
            player = p;
            for (const fn of fns) fn();
        },
    };
}

afterEach(() => vi.useRealTimers());

describe("lamp colour", () => {
    it("keeps the hue, raises a pale saturation; grey becomes warm white", () => {
        expect(lampColor("#3a8dde")).toEqual({ hs_color: [209.6, 73.9] });
        expect(lampColor("#c8b4a0")).toEqual({ hs_color: [30, 60] });
        expect(lampColor("#808080")).toEqual({ color_temp_kelvin: 2700 });
        expect(lampColorHex({ hs_color: [0, 100] })).toBe("#ff0000");
    });
});

describe("CoverLights", () => {
    const settings: CoverLightSettings = { lamps: ["light.a", "light.b"], transition: 3 };

    it("on: snapshot, then every lamp on in the colour; off: the snapshot back", async () => {
        vi.useFakeTimers();
        const s = setup({ "light.a": "off", "light.b": "on" });
        s.play({ color: "#ff0000" });
        s.lights.show("KEY1", settings);
        await s.lights.press("KEY1");
        expect(s.calls[0]).toEqual(["scene", "create", { scene_id: sceneId("KEY1"), snapshot_entities: ["light.a", "light.b"] }]);
        expect(s.saved.at(-1)?.active).toBe(true);
        await vi.advanceTimersByTimeAsync(0);
        expect(s.calls[1]).toEqual(["light", "turn_on", { entity_id: ["light.a", "light.b"], transition: 3, hs_color: [0, 100] }]);
        await s.lights.press("KEY1");
        expect(s.calls[2]).toEqual(["scene", "turn_on", { entity_id: `scene.${sceneId("KEY1")}`, transition: 3 }]);
        expect(s.saved.at(-1)?.active).toBe(false);
    });

    it("a new colour: settled, only lamps that are on, at most one command per 2 s", async () => {
        vi.useFakeTimers();
        const s = setup({ "light.a": "off", "light.b": "on" });
        s.lights.show("K", { ...settings, active: true, brightness: 40 });
        s.play({ color: "#00ff00" });
        await vi.advanceTimersByTimeAsync(999);
        expect(s.calls).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        expect(s.calls).toEqual([["light", "turn_on", { entity_id: ["light.b"], transition: 3, hs_color: [120, 100], brightness_pct: 40 }]]);
        s.play({ color: "#0000ff" });
        await vi.advanceTimersByTimeAsync(1000);
        expect(s.calls).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(s.calls.at(-1)?.[2]).toMatchObject({ hs_color: [240, 100] });
    });

    it("a key that is on keeps following on another page", async () => {
        vi.useFakeTimers();
        const s = setup({ "light.a": "on" });
        s.lights.show("K", { lamps: ["light.a"], active: true });
        s.lights.hide("K");
        s.play({ color: "#ff0000" });
        await vi.advanceTimersByTimeAsync(1000);
        expect(s.calls).toHaveLength(1);
    });

    it("nothing plays (no colour): the lamps stay; refuses without lamps", async () => {
        vi.useFakeTimers();
        const s = setup({ "light.a": "on" });
        s.lights.show("K", { lamps: ["light.a"], active: true });
        s.play(undefined);
        await vi.advanceTimersByTimeAsync(5000);
        expect(s.calls).toEqual([]);
        s.lights.show("E", {});
        await expect(s.lights.press("E")).rejects.toThrow();
    });
});
