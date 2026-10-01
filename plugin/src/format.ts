// Numbers on keys and dials in Stream Deck's language: "19,4" in German, "19.4" in English. Only
// for showing: what goes to a device keeps the point. Only plain decimal numbers change, so an IP
// address or a version ("2026.9.4") stays as it is.

let separator = ".";

/** Use the decimal separator of a language ("de" → ",", "en" → "."). */
export function setNumberLanguage(language: string | undefined): void {
    try {
        separator = new Intl.NumberFormat(language || "en").formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
    } catch {
        separator = ".";
    }
}

/** "19.4" → "19,4" in German; anything that isn't a plain decimal number stays as it is. */
export function localNumber(text: string): string;
export function localNumber(text: string | undefined): string | undefined;
export function localNumber(text: string | undefined): string | undefined {
    if (text === undefined || separator === "." || !/^[-+]?\d+\.\d+$/.test(text)) return text;
    return text.replace(".", separator);
}
