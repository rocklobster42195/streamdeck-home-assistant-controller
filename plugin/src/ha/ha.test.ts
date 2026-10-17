import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import net from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { HaConnection, type HaState } from "./ha-connection";
import { parseHaUrl, shortHaAddress } from "./url";

const quiet = { info: () => {}, warn: () => {} };

describe("parseHaUrl", () => {
    it("reads bare hosts as http on 8123", () => {
        expect(parseHaUrl("192.168.1.20")).toMatchObject({ url: "http://192.168.1.20:8123", port: 8123, secure: false });
        expect(parseHaUrl("homeassistant.local:8124")?.url).toBe("http://homeassistant.local:8124");
    });

    it("keeps the scheme and drops paths and trailing slashes", () => {
        expect(parseHaUrl("https://ha.example.org/")).toMatchObject({ url: "https://ha.example.org", port: 443, secure: true });
        expect(parseHaUrl("http://192.168.1.20:8123/lovelace/0")?.url).toBe("http://192.168.1.20:8123");
        expect(parseHaUrl(" HTTP://Host:80 ")?.url).toBe("http://host");
    });

    it("rejects other schemes and empty input", () => {
        expect(parseHaUrl("")).toBeUndefined();
        expect(parseHaUrl("mqtt://host")).toBeUndefined();
        expect(parseHaUrl("http://")).toBeUndefined();
    });

    it("shortens the usual address", () => {
        expect(shortHaAddress(parseHaUrl("192.168.1.20")!)).toBe("192.168.1.20");
        expect(shortHaAddress(parseHaUrl("https://ha.example.org")!)).toBe("https://ha.example.org");
    });
});

/** Just enough of Home Assistant's WebSocket API: auth, supported_features and subscribe_entities. */
function fakeHa(token: string): Promise<{ url: string; close: () => Promise<void> }> {
    return new Promise((ready) => {
        const wss = new WebSocketServer({ port: 0, path: "/api/websocket" });
        wss.on("connection", (ws: WebSocket) => {
            const send = (m: object) => ws.send(JSON.stringify(m));
            send({ type: "auth_required", ha_version: "2026.9.4" });
            ws.on("message", (raw) => {
                const msg = JSON.parse(String(raw)) as { type: string; id?: number; access_token?: string };
                if (msg.type === "auth") return send(msg.access_token === token ? { type: "auth_ok", ha_version: "2026.9.4" } : { type: "auth_invalid", message: "Invalid access token" });
                send({ id: msg.id, type: "result", success: true, result: null });
                if (msg.type === "subscribe_entities") send({ id: msg.id, type: "event", event: { a: { "light.desk": { s: "on", a: { brightness: 128 }, c: "x", lc: 1, lu: 1 } } } });
            });
        });
        wss.on("listening", () => {
            const port = (wss.address() as { port: number }).port;
            ready({ url: `http://127.0.0.1:${port}`, close: () => new Promise((done) => wss.close(() => done())) });
        });
    });
}

function waitFor(ha: HaConnection, state: HaState): Promise<void> {
    return new Promise((done) => {
        if (ha.state === state) return done();
        const off = ha.onState(() => {
            if (ha.state !== state) return;
            off();
            done();
        });
    });
}

describe("HaConnection", () => {
    let ha: HaConnection | undefined;
    let server: { url: string; close: () => Promise<void> } | undefined;
    afterEach(async () => {
        ha?.close();
        await server?.close();
    });

    it("needs an address and a token", () => {
        ha = new HaConnection(quiet);
        ha.configure({});
        expect(ha.state).toBe("unconfigured");
        ha.configure({ url: "ftp://x", token: "t" });
        expect(ha.state).toBe("invalid");
        ha.configure({ url: "192.168.1.20" });
        expect(ha.state).toBe("unconfigured");
    });

    it("connects and keeps the entities", async () => {
        server = await fakeHa("good");
        ha = new HaConnection(quiet);
        const got = new Promise<void>((done) => ha!.onEntities(() => done()));
        ha.configure({ url: server.url, token: "good" });
        await waitFor(ha, "online");
        await got;
        expect(ha.version).toBe("2026.9.4");
        expect(ha.entities["light.desk"]).toMatchObject({ state: "on", attributes: { brightness: 128 } });
        expect(ha.entityCount).toBe(1);
    });

    it("says denied for a wrong token", async () => {
        server = await fakeHa("good");
        ha = new HaConnection(quiet);
        ha.configure({ url: server.url, token: "bad" });
        await waitFor(ha, "denied");
        expect(ha.lastError).toBe("invalid token");
    });

    it("is offline while nothing answers", async () => {
        ha = new HaConnection(quiet);
        ha.configure({ url: "http://127.0.0.1:9", token: "t" });
        await waitFor(ha, "offline");
        expect(ha.lastError).toMatch(/^cannot connect/);
    });
});

/** A proxy that tunnels CONNECT requests and wants basic auth, like a company web gateway. */
function fakeProxy(user: string, password: string): Promise<{ address: string; connects: string[]; close: () => Promise<void> }> {
    const connects: string[] = [];
    const sockets = new Set<net.Socket>();
    const server = http.createServer((_req, res) => res.writeHead(400).end());
    server.on("connect", (req, client) => {
        sockets.add(client);
        const expected = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
        if (req.headers["proxy-authorization"] !== expected) {
            client.end("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm=\"test\"\r\nConnection: close\r\n\r\n");
            return;
        }
        const [host, port] = (req.url ?? "").split(":");
        connects.push(req.url ?? "");
        const upstream = net.connect(Number(port), host, () => {
            client.write("HTTP/1.1 200 Connection established\r\n\r\n");
            upstream.pipe(client);
            client.pipe(upstream);
        });
        sockets.add(upstream);
        upstream.on("error", () => client.destroy());
        client.on("error", () => upstream.destroy());
    });
    return new Promise((ready) =>
        server.listen(0, "127.0.0.1", () => {
            const port = (server.address() as net.AddressInfo).port;
            ready({
                address: `127.0.0.1:${port}`,
                connects,
                close: () =>
                    new Promise((done) => {
                        for (const s of sockets) s.destroy();
                        server.close(() => done());
                    }),
            });
        }),
    );
}

describe("HaConnection through a proxy", () => {
    let ha: HaConnection | undefined;
    let server: { url: string; close: () => Promise<void> } | undefined;
    let proxy: { address: string; connects: string[]; close: () => Promise<void> } | undefined;
    afterEach(async () => {
        ha?.close();
        ha?.configure({});
        await proxy?.close();
        await server?.close();
    });

    it("connects with the proxy's login and goes through it", async () => {
        server = await fakeHa("good");
        proxy = await fakeProxy("DOM\me", "secret");
        ha = new HaConnection(quiet);
        ha.configure({ url: server.url, token: "good", proxy: { url: proxy.address, user: "DOM\me", password: "secret" } });
        await waitFor(ha, "online");
        expect(proxy.connects).toHaveLength(1);
        expect(proxy.connects[0]).toBe(new URL(server.url).host);
    });

    it("is not online with a wrong proxy password", async () => {
        server = await fakeHa("good");
        proxy = await fakeProxy("DOM\me", "secret");
        ha = new HaConnection(quiet);
        ha.configure({ url: server.url, token: "good", proxy: { url: proxy.address, user: "DOM\me", password: "wrong" } });
        await waitFor(ha, "offline");
        await new Promise((r) => setTimeout(r, 300));
        expect(ha.state).not.toBe("online");
        expect(proxy.connects).toHaveLength(0);
    });
});
