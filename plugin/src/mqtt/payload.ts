// Reading and writing payloads: plain text as it is, a field of a JSON payload by its path
// ("state", "color.x", "list.0"), on/off values compared without case, publish templates.

/** The payload as JSON, if it is a JSON object or array; undefined for plain text. */
export function parseJson(payload: string): unknown {
    const t = payload.trim();
    if (!t.startsWith("{") && !t.startsWith("[")) return undefined;
    try {
        return JSON.parse(t);
    } catch {
        return undefined;
    }
}

/**
 * The value to show or compare: the whole payload without a path, the field at `path` for JSON.
 * Objects and arrays come back as JSON text; undefined when the field is missing.
 */
export function readValue(payload: string | undefined, path?: string): string | undefined {
    if (payload === undefined) return undefined;
    const p = path?.trim();
    if (!p) return payload;
    let node = parseJson(payload);
    if (node === undefined) return undefined;
    for (const part of p.split(".")) {
        if (node === null || typeof node !== "object") return undefined;
        node = (node as Record<string, unknown>)[part];
    }
    if (node === undefined) return undefined;
    if (node === null) return "null";
    return typeof node === "object" ? JSON.stringify(node) : String(node);
}

/** Whether a received value means the configured one ("ON" = "on", " true " = "true"). */
export function sameValue(received: string | undefined, configured: string | undefined): boolean {
    if (received === undefined || configured === undefined) return false;
    return received.trim().toLowerCase() === configured.trim().toLowerCase();
}

/**
 * The payload to publish: the template with every {value} replaced, or the value itself without a
 * template. Inside a JSON template, a quoted "{value}" stays a string and a bare {value} must be a
 * number or true/false/null; anything else is quoted so the result stays valid JSON.
 */
export function fillTemplate(template: string | undefined, value: string): string {
    const t = template?.trim();
    if (!t) return value;
    if (parseJson(t.replace(/\{value\}/g, "0")) === undefined) return t.replace(/\{value\}/g, value);
    return t.replace(/("?)\{value\}("?)/g, (_m, open: string, close: string) => {
        if (open && close) return JSON.stringify(value);
        const bare = /^(-?\d+(\.\d+)?|true|false|null)$/i.test(value.trim()) ? value.trim().toLowerCase() : JSON.stringify(value);
        return `${open}${bare}${close}`;
    });
}

/** Leaf paths of a JSON payload with their values, for the field picker ("color.x" → "0.31"). */
export function jsonFields(payload: string, max = 200): { path: string; value: string }[] {
    const out: { path: string; value: string }[] = [];
    const walk = (node: unknown, prefix: string) => {
        if (out.length >= max) return;
        if (node !== null && typeof node === "object") {
            for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, prefix ? `${prefix}.${k}` : k);
        } else if (prefix) {
            out.push({ path: prefix, value: node === null ? "null" : String(node) });
        }
    };
    const json = parseJson(payload);
    if (json !== undefined) walk(json, "");
    return out;
}
