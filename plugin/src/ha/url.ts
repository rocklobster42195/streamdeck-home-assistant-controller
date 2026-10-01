// Home Assistant's address as the user types it: a URL with http:// or https://, or a bare host
// (with an optional port), which means http://host:8123. Paths are dropped: HA lives at the root.

export type HaAddress = {
    /** The base URL for the WebSocket API, e.g. "http://192.168.1.20:8123" (no trailing slash). */
    url: string;
    host: string;
    port: number;
    secure: boolean;
};

const DEFAULT_PORT = 8123;

/** Parse what the user typed; undefined when it is empty or not a usable address. */
export function parseHaUrl(input: string | undefined): HaAddress | undefined {
    const text = input?.trim();
    if (!text) return undefined;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
    let u: URL;
    try {
        u = new URL(withScheme);
    } catch {
        return undefined;
    }
    const protocol = u.protocol.slice(0, -1).toLowerCase();
    if ((protocol !== "http" && protocol !== "https") || !u.hostname) return undefined;
    const secure = protocol === "https";
    // URL drops a port that is the protocol's default (80/443); a bare host means HA's 8123
    const explicit = /^[a-z]+:\/\/(?:[^/@]*@)?(?:\[[^\]]*\]|[^/:]*):(\d+)/i.exec(withScheme)?.[1];
    const hasScheme = withScheme === text;
    const port = explicit ? Number(explicit) : hasScheme ? (secure ? 443 : 80) : DEFAULT_PORT;
    const defaultPort = (secure && port === 443) || (!secure && port === 80);
    return { url: `${protocol}://${u.host.replace(/:\d+$/, "")}${defaultPort ? "" : `:${port}`}`, host: u.hostname, port, secure };
}

/** Short form for status lines: "192.168.1.20" for http on 8123, the URL otherwise. */
export function shortHaAddress(a: HaAddress): string {
    return !a.secure && a.port === DEFAULT_PORT ? a.host : a.url;
}
