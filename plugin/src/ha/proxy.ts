// Home Assistant behind a company proxy. Node ignores Windows' proxy settings (browsers and
// Chromium-based plugins use them), so the proxy is entered by hand and used for both the
// WebSocket API and REST. The proxy login is basic auth (user and password, e.g. "DOMAIN\user").
//
// home-assistant-js-websocket opens `new WebSocket(url)` from the global scope, so while a proxy
// is set the global WebSocket is replaced by one that goes through it; without a proxy the
// original comes back.
import tls from "node:tls";
import { fetch as undiciFetch, ProxyAgent, WebSocket as UndiciWebSocket, type Dispatcher } from "undici";

export type ProxyConfig = { url?: string; user?: string; password?: string };

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** "host:8080" or "http://host:8080" as a URL, undefined when empty or not an address. */
export function parseProxyUrl(input: string | undefined): string | undefined {
    const text = input?.trim();
    if (!text) return undefined;
    try {
        const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
        return u.protocol === "http:" || u.protocol === "https:" ? `${u.protocol}//${u.host}` : undefined;
    } catch {
        return undefined;
    }
}

/** The CAs Node trusts plus the ones in the system store (a company CA that re-signs HTTPS). */
function trustedCas(): string[] | undefined {
    const t = tls as unknown as { getCACertificates?: (type: "default" | "system") => string[] };
    if (!t.getCACertificates) return undefined;
    try {
        return [...t.getCACertificates("default"), ...t.getCACertificates("system")];
    } catch {
        return undefined;
    }
}

export function createProxyDispatcher(config: ProxyConfig): Dispatcher | undefined {
    const uri = parseProxyUrl(config.url);
    if (!uri) return undefined;
    const user = config.user?.trim();
    const token = user ? `Basic ${Buffer.from(`${user}:${config.password ?? ""}`).toString("base64")}` : undefined;
    return new ProxyAgent({ uri, token, requestTls: { ca: trustedCas() } });
}

/** fetch through the dispatcher; the plain global one without. */
export function fetchVia(dispatcher: Dispatcher | undefined): Fetch {
    if (!dispatcher) return (url, init) => fetch(url, init);
    return (url, init) => undiciFetch(url, { ...(init as object), dispatcher }) as unknown as Promise<Response>;
}

const originalWebSocket = globalThis.WebSocket;

/** Make `new WebSocket(url)` go through the dispatcher, or back to direct without one. */
export function useWebSocketVia(dispatcher: Dispatcher | undefined): void {
    if (!dispatcher) {
        globalThis.WebSocket = originalWebSocket;
        return;
    }
    class ProxiedWebSocket extends UndiciWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
            super(url, { dispatcher, protocols });
        }
    }
    globalThis.WebSocket = ProxiedWebSocket as unknown as typeof WebSocket;
}
