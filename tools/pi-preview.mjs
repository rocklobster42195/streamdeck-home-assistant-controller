// Preview the property inspectors in a normal browser, without Stream Deck.
// Serves plugin/*.sdPlugin/ui and fakes both the Stream Deck socket and the plugin's messages.
//
//   node tools/pi-preview.mjs   → http://localhost:5399/switch.html?scenario=online&lang=de
//   scenarios: online · setup · denied        lang: en · de        &settings=<json>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("plugin/package.json"));
const { WebSocketServer } = require("ws");

const HTTP_PORT = Number(process.env.PORT ?? 5399);
const WS_PORT = HTTP_PORT + 1;
const UUID = "de.boriskemper.mqtt-controller";
const UI = path.resolve(`plugin/${UUID}.sdPlugin/ui`);

// Invented topics (screenshots go public)
const topics = {
    "zigbee2mqtt/Wohnzimmer Lampe": '{"state":"ON","brightness":180,"color_temp":370,"linkquality":120}',
    "zigbee2mqtt/Wohnzimmer Lampe/availability": '{"state":"online"}',
    "zigbee2mqtt/Wohnzimmer Klima": '{"temperature":21.4,"humidity":48.2,"battery":91}',
    "zigbee2mqtt/Wohnzimmer Klima/availability": '{"state":"online"}',
    "stat/plug1/POWER": "ON",
    "tele/plug1/LWT": "Online",
    "shellies/plug-kitchen/relay/0/power": "1234.5",
    "home/door/state": "open",
};
const suggestions = {
    "zigbee2mqtt/Wohnzimmer Lampe": { scheme: "zigbee2mqtt", commandTopic: "zigbee2mqtt/Wohnzimmer Lampe/set", field: "state", onValue: "ON", offValue: "OFF", template: '{"state":"{value}"}', availabilityTopic: "zigbee2mqtt/Wohnzimmer Lampe/availability" },
    "stat/plug1/POWER": { scheme: "tasmota", commandTopic: "cmnd/plug1/POWER", onValue: "ON", offValue: "OFF", availabilityTopic: "tele/plug1/LWT" },
};

const fields = (payload) => {
    const out = [];
    const walk = (node, prefix) => {
        if (node !== null && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}.${k}` : k);
        else if (prefix) out.push({ path: prefix, value: String(node) });
    };
    try {
        if (/^\s*[{[]/.test(payload)) walk(JSON.parse(payload), "");
    } catch {}
    return out;
};

const scenarios = {
    online: { global: { brokerUrl: "192.168.1.10", brokerUser: "mqc" }, status: { state: "online", address: "192.168.1.10", topics: Object.keys(topics).length } },
    setup: { global: {}, status: { state: "unconfigured" } },
    denied: { global: { brokerUrl: "192.168.1.10", brokerUser: "mqc" }, status: { state: "denied", address: "192.168.1.10" } },
};

const wss = new WebSocketServer({ port: WS_PORT });
wss.on("connection", (ws) => {
    let scenario = scenarios.online;
    const reply = (msg) => ws.send(JSON.stringify(msg));
    const toPi = (payload) => reply({ event: "sendToPropertyInspector", payload });
    ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.uuid) scenario = scenarios[msg.uuid.split(":")[1]] ?? scenarios.online;
        switch (msg.event) {
            case "getGlobalSettings":
                reply({ event: "didReceiveGlobalSettings", payload: { settings: scenario.global } });
                break;
            case "setGlobalSettings":
                scenario = { ...scenario, global: msg.payload };
                break;
            case "sendToPlugin": {
                const p = msg.payload ?? {};
                const online = scenario.status.state === "online";
                if (p.event === "pi-ready") toPi({ event: "status", status: scenario.status });
                else if (p.event === "options") toPi({ event: "options-result", requestId: p.requestId, source: p.source, items: [] });
                else if (p.event === "topics") {
                    const words = String(p.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
                    const hits = online ? Object.entries(topics).filter(([t]) => words.every((w) => t.toLowerCase().includes(w))).map(([topic, value]) => ({ topic, value, retained: true })) : [];
                    toPi({ event: "topics-result", requestId: p.requestId, hits, total: hits.length });
                } else if (p.event === "topic-info") {
                    const payload = online ? topics[p.topic] : undefined;
                    toPi({ event: "topic-info-result", requestId: p.requestId, info: { topic: p.topic, payload, fields: payload ? fields(payload) : [], suggestion: suggestions[p.topic] } });
                }
                break;
            }
        }
    });
});

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

http.createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${HTTP_PORT}`);
    const file = path.join(UI, decodeURIComponent(u.pathname === "/" ? "/switch.html" : u.pathname));
    if (!file.startsWith(UI) || !fs.existsSync(file)) {
        res.writeHead(404).end("not found");
        return;
    }
    let body = fs.readFileSync(file);
    if (file.endsWith(".html")) {
        const scenario = u.searchParams.get("scenario") ?? "online";
        const lang = u.searchParams.get("lang") ?? "de";
        const settings = JSON.parse(u.searchParams.get("settings") ?? "{}");
        const info = { application: { language: lang, platform: "windows", version: "7.6" }, plugin: { uuid: UUID, version: "0.1.0" } };
        const actionInfo = { action: `${UUID}.${path.basename(file, ".html")}`, context: "ctx", device: "dev", payload: { settings } };
        const boot = `<script>window.addEventListener("load",()=>connectElgatoStreamDeckSocket(${WS_PORT},"pi:${scenario}","registerPropertyInspector",${JSON.stringify(JSON.stringify(info))},${JSON.stringify(JSON.stringify(actionInfo))}));</script><style>body{width:360px}</style>`;
        body = Buffer.from(String(body).replace("</body>", `${boot}</body>`));
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(body);
}).listen(HTTP_PORT, () => console.log(`PI preview: http://localhost:${HTTP_PORT}/switch.html?scenario=online&lang=de`));
