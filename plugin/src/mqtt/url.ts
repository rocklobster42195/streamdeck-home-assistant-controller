// The broker address as the user types it: a URL with mqtt://, mqtts://, ws:// or wss://, or a bare
// host (with an optional port), which means mqtt://host:1883.

export type BrokerProtocol = "mqtt" | "mqtts" | "ws" | "wss";

const PROTOCOLS: readonly BrokerProtocol[] = ["mqtt", "mqtts", "ws", "wss"];

/** Default ports per protocol (ws/wss: Mosquitto's usual websocket listeners). */
const DEFAULT_PORTS: Record<BrokerProtocol, number> = { mqtt: 1883, mqtts: 8883, ws: 9001, wss: 9001 };

export type BrokerAddress = {
    /** The full URL for the mqtt client, e.g. "mqtt://192.168.1.10:1883". */
    url: string;
    protocol: BrokerProtocol;
    host: string;
    port: number;
    /** Websocket path ("/mqtt"), empty for mqtt/mqtts. */
    path: string;
};

/** Parse what the user typed; undefined when it is empty or not a usable address. */
export function parseBrokerUrl(input: string | undefined): BrokerAddress | undefined {
    const text = input?.trim();
    if (!text) return undefined;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `mqtt://${text}`;
    let u: URL;
    try {
        u = new URL(withScheme);
    } catch {
        return undefined;
    }
    const protocol = u.protocol.slice(0, -1).toLowerCase() as BrokerProtocol;
    if (!PROTOCOLS.includes(protocol) || !u.hostname) return undefined;
    // URL drops a port that is the default of ws/wss (80/443), so read it from the text
    const explicit = /^[a-z]+:\/\/(?:[^/@]*@)?(?:\[[^\]]*\]|[^/:]*):(\d+)/i.exec(withScheme)?.[1];
    const port = explicit ? Number(explicit) : DEFAULT_PORTS[protocol];
    const ws = protocol === "ws" || protocol === "wss";
    const path = ws ? (u.pathname && u.pathname !== "/" ? u.pathname : "/mqtt") : "";
    return { url: `${protocol}://${u.hostname}:${port}${path}`, protocol, host: u.hostname, port, path };
}

/** Short form for status lines: "192.168.1.10" for the default mqtt port, the URL otherwise. */
export function shortAddress(a: BrokerAddress): string {
    return a.protocol === "mqtt" && a.port === 1883 ? a.host : a.url;
}
