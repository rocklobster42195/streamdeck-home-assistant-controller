import { afterEach, describe, expect, it } from "vitest";
import { localNumber, setNumberLanguage } from "./format";
import { shownValue } from "./mqtt/value-state";

describe("numbers in the user's language", () => {
    afterEach(() => setNumberLanguage("en"));

    it("writes a decimal comma in German, a point in English", () => {
        setNumberLanguage("de");
        expect(localNumber("19.4")).toBe("19,4");
        expect(localNumber("-0.5")).toBe("-0,5");
        expect(shownValue("21.456", undefined, "1").text).toBe("21,5");
        setNumberLanguage("en");
        expect(localNumber("19.4")).toBe("19.4");
    });

    it("leaves everything else alone", () => {
        setNumberLanguage("de");
        expect(localNumber("2026.9.4")).toBe("2026.9.4");
        expect(localNumber("192.168.1.1")).toBe("192.168.1.1");
        expect(localNumber("42")).toBe("42");
        expect(localNumber("Bewölkt")).toBe("Bewölkt");
        expect(shownValue("21.4").number).toBe(21.4);
    });
});
