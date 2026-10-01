import { describe, expect, it } from "vitest";
import type { Message } from "./broker";
import { Listener, treeLevel } from "./topic-tree";

const m = (payload: string, at = 0, retained = true): Message => ({ payload, at, retained });
const id = (p: string) => p;

describe("treeLevel", () => {
    const topics: [string, Message][] = [
        ["zigbee2mqtt/Lampe", m('{"state":"ON"}')],
        ["zigbee2mqtt/Lampe/availability", m("online")],
        ["zigbee2mqtt/bridge/state", m("online")],
        ["tele/plug1/STATE", m("{}")],
        ["standalone", m("1")],
    ];
    it("lists the roots, folders first", () => {
        expect(treeLevel(topics, "", id).map((n) => [n.name, n.count])).toEqual([
            ["tele", 1],
            ["zigbee2mqtt", 3],
            ["standalone", 0],
        ]);
    });
    it("lists a level with values and sub-topics", () => {
        expect(treeLevel(topics, "zigbee2mqtt", id)).toEqual([
            { name: "bridge", topic: "zigbee2mqtt/bridge", count: 1 },
            { name: "Lampe", topic: "zigbee2mqtt/Lampe", count: 1, value: '{"state":"ON"}' },
        ]);
    });
    it("is empty below a leaf", () => {
        expect(treeLevel(topics, "standalone", id)).toEqual([]);
    });
});

describe("Listener", () => {
    it("lists what changed, quiet topics before busy ones", () => {
        const l = new Listener(60_000);
        l.start([["sensor/power", m("12", 95_000, false)], ["lamp", m("OFF", 10_000)]], 100_000);
        l.add("sensor/power", m("13", 101_000, false));
        l.add("sensor/power", m("14", 103_000, false));
        l.add("lamp", m("ON", 102_000, false));
        l.add("old", m("x", 99_000, false));
        l.add("retained/late", m("y", 104_000, true));
        expect(l.result(id)).toEqual([
            { topic: "lamp", value: "ON", count: 1, busy: false },
            { topic: "sensor/power", value: "14", count: 2, busy: true },
        ]);
    });
});
