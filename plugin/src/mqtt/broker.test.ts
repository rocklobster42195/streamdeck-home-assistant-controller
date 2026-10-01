// The broker client against a real (in-process) aedes broker.
import { createServer, type Server } from "node:net";
import { Aedes } from "aedes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Broker, newClientId } from "./broker";

let aedes: Aedes;
let server: Server;
let port = 0;
const quiet = { info: () => {}, warn: () => {} };

beforeAll(async () => {
    aedes = await Aedes.createBroker({
        authenticate: (_client, user, password, done) => done(null, !user || (user === "mqc" && password?.toString() === "secret")),
    });
    server = createServer(aedes.handle);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as { port: number }).port;
    // A retained state like a real device's
    await new Promise<void>((r) => aedes.publish({ cmd: "publish", topic: "mqc/test/lamp", payload: Buffer.from('{"state":"ON"}'), qos: 0, retain: true, dup: false }, () => r()));
});

afterAll(async () => {
    await new Promise<void>((r) => aedes.close(() => r()));
    await new Promise<void>((r) => server.close(() => r()));
});

const until = async (check: () => boolean, ms = 3000) => {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error("timeout");
        await new Promise((r) => setTimeout(r, 20));
    }
};

describe("Broker", () => {
    it("connects, gets retained values and shares subscriptions", async () => {
        const b = new Broker(quiet);
        b.subscribe("mqc/test/lamp", "key1");
        b.subscribe("mqc/test/lamp", "key2");
        b.configure({ url: `127.0.0.1:${port}`, clientId: newClientId() });
        expect(b.state).toBe("connecting");
        await until(() => b.state === "online");
        await until(() => !!b.value("mqc/test/lamp"));
        expect(b.value("mqc/test/lamp")).toMatchObject({ payload: '{"state":"ON"}', retained: true });

        // Publishing reaches subscribers; one owner leaving keeps the subscription
        b.unsubscribe("mqc/test/lamp", "key1");
        expect(b.publish("mqc/test/lamp", '{"state":"OFF"}')).toBe(true);
        await until(() => b.value("mqc/test/lamp")?.payload === '{"state":"OFF"}');
        b.close();
    });

    it("subscribes topics added while online", async () => {
        const b = new Broker(quiet);
        b.configure({ url: `mqtt://127.0.0.1:${port}`, clientId: newClientId() });
        await until(() => b.state === "online");
        b.subscribe("mqc/test/later", "k");
        await new Promise((r) => setTimeout(r, 100));
        b.publish("mqc/test/later", "21.5");
        await until(() => b.value("mqc/test/later")?.payload === "21.5");
        b.close();
    });

    it("reports a refused login as denied and stops", async () => {
        const b = new Broker(quiet);
        b.configure({ url: `127.0.0.1:${port}`, user: "mqc", password: "wrong", clientId: newClientId() });
        await until(() => b.state === "denied");
        b.configure({ url: `127.0.0.1:${port}`, user: "mqc", password: "secret", clientId: newClientId() });
        await until(() => b.state === "online");
        b.close();
    });

    it("keeps one connection when settings change while connecting", async () => {
        const id = newClientId();
        const b = new Broker(quiet);
        const config = { url: `127.0.0.1:${port}`, clientId: id };
        // The settings panel's Connect button: a field saves (new settings), then "reconnect" 50 ms later
        b.configure({ ...config, user: "" });
        b.configure({ ...config, password: "" , user: undefined }, true);
        b.configure(config, true);
        await until(() => b.state === "online");
        await new Promise((r) => setTimeout(r, 1500));
        const sessions = Object.values(aedes.clients).filter((c) => c.id === id);
        expect(sessions.length).toBe(1);
        expect(b.state).toBe("online");
        b.close();
    });

    it("knows unconfigured and invalid addresses", () => {
        const b = new Broker(quiet);
        b.configure({ url: "", clientId: "x" });
        expect(b.state).toBe("unconfigured");
        b.configure({ url: "http://nope", clientId: "x" });
        expect(b.state).toBe("invalid");
    });
});
