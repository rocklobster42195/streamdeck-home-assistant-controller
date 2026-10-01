import { describe, expect, it } from "vitest";
import { switchCommand, switchState } from "./switch-state";

describe("switchState", () => {
    it("recognises the usual pairs without own values", () => {
        expect(switchState({}, "ON")).toBe("on");
        expect(switchState({}, "off")).toBe("off");
        expect(switchState({}, "true")).toBe("on");
        expect(switchState({}, "false")).toBe("off");
        expect(switchState({}, "1")).toBe("on");
        expect(switchState({}, "0")).toBe("off");
        expect(switchState({}, "closed")).toBe("off");
        expect(switchState({ field: "output" }, '{"output":true}')).toBe("on");
        expect(switchState({}, "21.5")).toBe("unknown");
        expect(switchState({}, undefined)).toBe("unknown");
    });
    it("uses only the user's values once set", () => {
        expect(switchState({ onValue: "auf", offValue: "zu" }, "zu")).toBe("off");
        expect(switchState({ onValue: "auf", offValue: "zu" }, "true")).toBe("unknown");
        expect(switchState({ onValue: "true" }, "OFF")).toBe("off");
    });
});

describe("switchCommand", () => {
    it("answers in the pair the device reports", () => {
        expect(switchCommand({ stateTopic: "hm-rpc/0/X/1/STATE" }, false, "true")).toEqual({ topic: "hm-rpc/0/X/1/STATE", payload: "false" });
        expect(switchCommand({ stateTopic: "s" }, true, "0")?.payload).toBe("1");
        expect(switchCommand({ stateTopic: "s" }, true, "off")?.payload).toBe("on");
        expect(switchCommand({ stateTopic: "s" }, false, "ON")?.payload).toBe("OFF");
    });
    it("sends ON/OFF when nothing is known yet", () => {
        expect(switchCommand({ stateTopic: "s" }, true)?.payload).toBe("ON");
        expect(switchCommand({ commandTopic: "c" }, false)).toEqual({ topic: "c", payload: "OFF" });
    });
    it("prefers own command values and templates", () => {
        expect(switchCommand({ stateTopic: "s", commandOn: "on", template: '{"state":"{value}"}' }, true, "true")?.payload).toBe('{"state":"on"}');
        expect(switchCommand({ stateTopic: "s", onValue: "auf", offValue: "zu" }, false, "true")?.payload).toBe("zu");
        expect(switchCommand({}, true)).toBeUndefined();
    });
});
