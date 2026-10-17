import { describe, expect, it } from "vitest";
import { renderValueKey, type ValueKeyView } from "./value-key";

const svg = (uri: string): string => Buffer.from(uri.split(",")[1], "base64").toString("utf8");
/** The fill of the icon's path, found by its drawing (the gauge's arcs are paths too). */
const iconFill = (uri: string): string | undefined => /<path[^>]*fill="([^"]+)"[^>]*d="M0 0h24v24H0z"/.exec(svg(uri))?.[1];

const view: ValueKeyView = {
    look: "text",
    text: "30",
    number: 30,
    unit: "°C",
    icon: "M0 0h24v24H0z",
    zones: [
        { from: -Infinity, color: "#4dabf7" },
        { from: 25, color: "#ff6b6b" },
    ],
    min: 0,
    max: 100,
    offline: false,
};

describe("Value key icon colour", () => {
    it("keeps the icon neutral by default", () => {
        expect(iconFill(renderValueKey(view))).toBe("#e8e8ec");
    });

    it("takes the colour of the value's range when asked", () => {
        expect(iconFill(renderValueKey({ ...view, iconInRangeColor: true }))).toBe("#ff6b6b");
        expect(iconFill(renderValueKey({ ...view, number: 10, iconInRangeColor: true }))).toBe("#4dabf7");
    });

    it("dims the icon offline, also when coloured", () => {
        expect(iconFill(renderValueKey({ ...view, offline: true, iconInRangeColor: true }))).toBe("#7a7a80");
    });

    it("colours the icon in the gauge look too", () => {
        expect(iconFill(renderValueKey({ ...view, look: "gauge", iconInRangeColor: true }))).toBe("#ff6b6b");
    });
});
