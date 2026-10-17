import { describe, expect, it } from "vitest";
import { canProtect, protectSecret, unprotectSecret } from "./secret";

describe.runIf(canProtect)("secret (Windows DPAPI)", () => {
    it("round-trips a password, also with special characters", async () => {
        const plain = "pässwörd \"quoted\" $x `y` ' 日本";
        const form = await protectSecret(plain);
        expect(form).toMatch(/^dpapi1:/);
        expect(form).not.toContain("quoted");
        expect(await unprotectSecret(form!)).toBe(plain);
    }, 30_000);

    it("does not decrypt something else", async () => {
        expect(await unprotectSecret("dpapi1:AAAA")).toBeUndefined();
        expect(await unprotectSecret("plain text")).toBeUndefined();
    }, 30_000);
});

describe.runIf(!canProtect)("secret elsewhere", () => {
    it("says it cannot protect", async () => {
        expect(await protectSecret("x")).toBeUndefined();
    });
});
