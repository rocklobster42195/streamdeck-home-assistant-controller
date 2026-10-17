// Keeps a secret (the proxy password) out of the settings in clear text. On Windows it is
// encrypted with DPAPI for the current user (PowerShell, System.Security): the result only
// decrypts for this account on this PC, so copied profiles, backups and synced folders don't give
// it away. Elsewhere, or when PowerShell fails, nothing is encrypted (callers fall back to plain).
import { execFile } from "node:child_process";

const PREFIX = "dpapi1:";
const TIMEOUT_MS = 15_000;

// The secret travels through stdin and out through stdout as base64 of its UTF-8 bytes: neither
// the process list nor the console code page can touch it.
const COMMON = `$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;$e=[Text.Encoding]::UTF8.GetBytes('HA-C proxy');$in=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());`;
const PROTECT = `${COMMON}[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($in,$e,'CurrentUser')))`;
const UNPROTECT = `${COMMON}[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($in,$e,'CurrentUser')))`;

function powershell(script: string, stdin: string): Promise<string | undefined> {
    return new Promise((resolve) => {
        const child = execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: TIMEOUT_MS, encoding: "utf8" }, (err, stdout) => {
            resolve(err ? undefined : stdout.trim() || undefined);
        });
        child.stdin?.end(stdin);
    });
}

/** Whether secrets can be encrypted on this system. */
export const canProtect = process.platform === "win32";

/** The encrypted form ("dpapi1:…") of `plain`, or undefined when it can't be encrypted here. */
export async function protectSecret(plain: string): Promise<string | undefined> {
    if (!canProtect || !plain) return undefined;
    const out = await powershell(PROTECT, Buffer.from(plain, "utf8").toString("base64"));
    return out ? PREFIX + out : undefined;
}

/** The secret behind an encrypted form; undefined for a foreign form or one from another account or PC. */
export async function unprotectSecret(protectedForm: string): Promise<string | undefined> {
    if (!canProtect || !protectedForm.startsWith(PREFIX)) return undefined;
    const out = await powershell(UNPROTECT, protectedForm.slice(PREFIX.length));
    return out ? Buffer.from(out, "base64").toString("utf8") : undefined;
}
