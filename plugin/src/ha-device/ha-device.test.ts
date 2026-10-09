import { describe, expect, it, vi } from "vitest";
import type { Player } from "@rocklobster42195/streamdeck-kit";
import { coverColorReport, rgbToHs } from "./cover-color";
import { HaDevice } from "./ha-device";
import { bridgeTopics, COVER_COLOR_ENTITY, coverColorConfig } from "./discovery";

const info = { nodeId: "hac-12345678", host: "PC", version: "1.0.0", language: "de" };
const t = bridgeTopics(info.nodeId);

function player(p: Partial<Player>): Player {
    return { player: "p", name: "Wohnzimmer", kind: "speaker", playing: true, since: 0, id: "device:wz", routes: [], via: {} as never, from: {} as never, ...p } as Player;
}

function setup(o: { broker?: string; ha?: string; registry?: string[]; entities?: Record<string, unknown> } = {}) {
    let current: Player | undefined;
    const boardFns = new Set<() => void>();
    const brokerFns = new Set<() => void>();
    const msgFns = new Set<(topic: string, msg: { payload: string }) => void>();
    const published: [string, string, boolean][] = [];
    const rest: [string, ...unknown[]][] = [];
    const broker = {
        state: o.broker ?? "online",
        publish: (topic: string, payload: string, opts: { retain?: boolean } = {}) => (published.push([topic, payload, !!opts.retain]), true),
        subscribe: vi.fn(),
        onState: (fn: () => void) => (brokerFns.add(fn), () => brokerFns.delete(fn)),
        onMessage: (fn: (topic: string, msg: { payload: string }) => void) => (msgFns.add(fn), () => msgFns.delete(fn)),
    };
    const ha = {
        state: o.ha ?? "online",
        entities: o.entities ?? {},
        registry: async () => ({ areas: [], labels: [], devices: [], entities: (o.registry ?? []).map((entity_id) => ({ entity_id })) }),
        setRestState: async (...a: unknown[]) => (rest.push(["set", ...a]), true),
        deleteRestState: async (...a: unknown[]) => (rest.push(["delete", ...a]), true),
        onState: () => () => {},
    };
    const device = new HaDevice({
        board: { resolve: () => current, onChange: (fn) => (boardFns.add(fn), () => boardFns.delete(fn)) },
        broker: broker as never,
        ha: ha as never,
        info: () => info,
        settleMs: 1000,
    });
    return {
        device,
        published,
        rest,
        play(p: Partial<Player> | undefined) {
            current = p ? player(p) : undefined;
            for (const fn of boardFns) fn();
        },
        retained(topic: string, payload: string) {
            for (const fn of msgFns) fn(topic, { payload });
        },
    };
}

describe("cover colour report", () => {
    it("hex state, rgb and hs attributes, what plays", () => {
        const r = coverColorReport(player({ color: "#3A8DDE", title: "Song", artist: "Band", source: "Spotify" }));
        expect(r).toEqual({
            state: "#3a8dde",
            attributes: { rgb_color: [58, 141, 222], hs_color: [209.6, 73.9], playing: true, player: "Wohnzimmer", player_id: "device:wz", title: "Song", artist: "Band", source: "Spotify" },
        });
        expect(coverColorReport(player({}))).toBeUndefined();
        expect(rgbToHs([128, 128, 128])).toEqual([0, 0]);
    });

    it("the discovered sensor belongs to the bridge device", () => {
        const c = coverColorConfig(info);
        expect(c.default_entity_id).toBe(COVER_COLOR_ENTITY);
        expect(c.device.name).toBe("HA-C auf PC");
        expect(c.availability_topic).toBe(t.status);
    });
});

describe("HaDevice", () => {
    it("on with a broker: device config and online, then the settled colour (attributes first)", () => {
        vi.useFakeTimers();
        const s = setup();
        s.device.setEnabled(true);
        expect(s.published.map(([topic]) => topic)).toEqual([t.coverColor.config, t.status]);
        s.published.length = 0;
        s.play({ color: "#ff0000" });
        s.play({ color: "#00ff00" });
        vi.advanceTimersByTime(999);
        expect(s.published).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(s.published).toEqual([
            [t.coverColor.attributes, expect.stringContaining('"rgb_color":[0,255,0]'), true],
            [t.coverColor.state, "#00ff00", true],
        ]);
        // No colour (nothing plays any more): the last one stays
        s.play(undefined);
        vi.advanceTimersByTime(2000);
        expect(s.published).toHaveLength(2);
        vi.useRealTimers();
    });

    it("a colour that flashes and goes back within the settle time is not reported", () => {
        vi.useFakeTimers();
        const s = setup();
        s.device.setEnabled(true);
        s.play({ color: "#ff0000" });
        vi.advanceTimersByTime(1000);
        s.published.length = 0;
        s.play({ color: "#0000ff" });
        s.play({ color: "#ff0000" });
        vi.advanceTimersByTime(1000);
        expect(s.published).toEqual([]);
        vi.useRealTimers();
    });

    it("without a broker: the colour as a REST state", async () => {
        vi.useFakeTimers();
        const s = setup({ broker: "unconfigured" });
        s.device.setEnabled(true);
        expect(s.device.mode).toBe("rest");
        s.play({ color: "#ff0000", playing: false });
        vi.advanceTimersByTime(1000);
        expect(s.rest).toEqual([["set", COVER_COLOR_ENTITY, "#ff0000", expect.objectContaining({ playing: false, friendly_name: "Coverfarbe" })]]);
        vi.useRealTimers();
    });

    it("off: empties our retained discovery topics; nothing reported", () => {
        vi.useFakeTimers();
        const s = setup();
        s.play({ color: "#ff0000" });
        vi.advanceTimersByTime(2000);
        s.retained(t.coverColor.config, "{}");
        expect(s.published.map(([topic, payload]) => [topic, payload])).toEqual([
            [t.coverColor.config, ""],
            [t.coverColor.attributes, ""],
            [t.coverColor.state, ""],
            [t.status, ""],
        ]);
        vi.useRealTimers();
    });

    it("a REST state left over is deleted, the discovered sensor is not", async () => {
        const left = setup({ entities: { [COVER_COLOR_ENTITY]: {} } });
        left.device.setEnabled(true);
        await vi.waitFor(() => expect(left.rest).toEqual([["delete", COVER_COLOR_ENTITY]]));
        const mqtt = setup({ entities: { [COVER_COLOR_ENTITY]: {} }, registry: [COVER_COLOR_ENTITY] });
        mqtt.device.setEnabled(true);
        await new Promise((r) => setTimeout(r, 10));
        expect(mqtt.rest).toEqual([]);
    });
});
