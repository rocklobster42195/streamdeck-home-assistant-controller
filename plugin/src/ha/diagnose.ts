// Why "cannot connect"? The WebSocket library only reports that the socket never opened, so the
// reason is looked up with plain requests to the same address: one HTTP request (DNS, certificate,
// refused or timed out connections show up there with their error code, a proxy that answers shows
// up as its status) and, if that works, the WebSocket handshake by hand (a firewall that drops or
// answers the upgrade shows up there).
import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";

import type { Fetch } from "./proxy";

const TIMEOUT_MS = 8000;

/** A short reason ("ENOTFOUND", "HTTP 502", "WebSocket upgrade: HTTP 403"), or undefined if all works. */
export async function explainConnectFailure(url: string, fetchFn: Fetch = (u, i) => fetch(u, i), viaProxy = false): Promise<string | undefined> {
    const http = await probeHttp(url, fetchFn);
    // Through a proxy the hand-made handshake would go around it
    if (http || viaProxy) return http ? (viaProxy ? `proxy: ${http}` : http) : undefined;
    return probeUpgrade(url);
}

async function probeHttp(url: string, fetchFn: Fetch): Promise<string | undefined> {
    try {
        const res = await fetchFn(`${url}/api/`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        // 401 is what HA answers without a token: the address and certificate are fine
        if (res.status === 401 || res.ok) return undefined;
        return `HTTP ${res.status}`;
    } catch (e) {
        const err = e as { name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } };
        if (err.name === "TimeoutError") return "timeout";
        return err.cause?.code ?? err.code ?? err.cause?.message ?? err.message;
    }
}

/** The handshake of /api/websocket through Node's own HTTP client; what the server answers, or why not. */
function probeUpgrade(url: string): Promise<string | undefined> {
    return new Promise((resolve) => {
        const u = new URL(url);
        const open = u.protocol === "https:" ? request : httpRequest;
        const req = open({
            host: u.hostname,
            port: u.port || (u.protocol === "https:" ? 443 : 80),
            path: "/api/websocket",
            headers: {
                Connection: "Upgrade",
                Upgrade: "websocket",
                "Sec-WebSocket-Version": "13",
                "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
            },
            timeout: TIMEOUT_MS,
        });
        const done = (reason: string | undefined) => {
            req.destroy();
            resolve(reason);
        };
        req.on("upgrade", (_res, socket) => {
            socket.destroy();
            // Node's HTTP client got through, so it is the WebSocket client the firewall dislikes
            done("WebSocket upgrade works with Node's HTTP client (101), but not with the WebSocket client");
        });
        req.on("response", (res) => {
            const type = res.headers["content-type"] ?? "";
            const server = res.headers.server ? `, server ${String(res.headers.server).slice(0, 40)}` : "";
            done(`WebSocket upgrade answered HTTP ${res.statusCode} (${String(type).split(";")[0] || "no content type"}${server})`);
        });
        req.on("timeout", () => done("WebSocket upgrade: no answer (timeout)"));
        req.on("error", (e: NodeJS.ErrnoException) => done(`WebSocket upgrade: ${e.code ?? e.message}`));
        req.end();
    });
}
