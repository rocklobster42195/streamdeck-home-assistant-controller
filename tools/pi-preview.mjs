// Preview the property inspectors in a normal browser, without Stream Deck.
// Serves plugin/*.sdPlugin/ui and fakes both the Stream Deck socket and the plugin's messages.
//
//   node tools/pi-preview.mjs   → http://localhost:5399/switch.html?scenario=online&lang=de
//   scenarios: online · setup · denied · ha-only · mqtt-only        lang: en · de        &settings=<json>
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { listEffects } from "@rocklobster42195/streamdeck-kit";
const PANORAMA_EFFECTS = listEffects();
const require = createRequire(path.resolve("plugin/package.json"));
const { WebSocketServer } = require("ws");
const mdi = require("@mdi/js");

/** The plugin's "mdi-icons" options: an exact name, or names containing every word. */
const mdiOptions = (q = "") => {
    if (mdi[q]) return [{ value: q, label: q, icon: mdi[q] }];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return Object.keys(mdi)
        .filter((n) => words.every((w) => n.toLowerCase().includes(w)))
        .slice(0, 48)
        .map((n) => ({ value: n, label: n.slice(3), icon: mdi[n] }));
};

const HTTP_PORT = Number(process.env.PORT ?? 5399);
const WS_PORT = HTTP_PORT + 1;
const UUID = "de.boriskemper.ha-controller";
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

const haOnline = { state: "online", address: "192.168.1.20", version: "2026.9.4", entities: 412 };
const haGlobal = { haUrl: "192.168.1.20", haToken: "token" };
const scenarios = {
    online: { global: { ...haGlobal, brokerUrl: "192.168.1.10", brokerUser: "hac" }, ha: haOnline, status: { state: "online", address: "192.168.1.10", topics: Object.keys(topics).length } },
    setup: { global: {}, ha: { state: "unconfigured" }, status: { state: "unconfigured" } },
    denied: { global: { ...haGlobal, brokerUrl: "192.168.1.10", brokerUser: "hac" }, ha: { state: "denied", address: "192.168.1.20", error: "invalid token" }, status: { state: "denied", address: "192.168.1.10" } },
    "ha-only": { global: haGlobal, ha: haOnline, status: { state: "unconfigured" } },
    "mqtt-only": { global: { brokerUrl: "192.168.1.10", brokerUser: "hac" }, ha: { state: "unconfigured" }, status: { state: "online", address: "192.168.1.10", topics: Object.keys(topics).length } },
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
                if (p.event === "pi-ready") {
                    toPi({ event: "ha-status", status: scenario.ha });
                    toPi({ event: "status", status: scenario.status });
                    // The Slider's Panorama section: a row with dials of three plugins
                    toPi({ event: "panorama-row", device: "deck", effect: "particles", settings: { savedSpeed: 2 }, effects: PANORAMA_EFFECTS, dials: [
                        { column: 0, plugin: "MA-C", label: "Living Room", member: true, self: false },
                        { column: 1, plugin: "HA-C", label: "Heizung Bad", member: true, self: true },
                        { column: 2, plugin: "XR-C", label: "Vocals", member: false, self: false },
                    ] });
                } else if (p.event === "ha-find") setTimeout(() => toPi({ event: "ha-find-result", requestId: p.requestId, found: [{ name: "Zuhause", url: "http://192.168.1.20:8123", version: "2026.9.4" }] }), 800);
                else if (p.event === "options") toPi({ event: "options-result", requestId: p.requestId, source: p.source, items: p.source === "mdi-icons" ? mdiOptions(p.params?.q) : [] });
                else if (p.event === "topics") {
                    const words = String(p.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
                    const hits = online ? Object.entries(topics).filter(([t]) => words.every((w) => t.toLowerCase().includes(w))).map(([topic, value]) => ({ topic, value, retained: true })) : [];
                    toPi({ event: "topics-result", requestId: p.requestId, hits, total: hits.length });
                } else if (p.event === "topic-tree") {
                    const base = p.prefix ? `${p.prefix}/` : "";
                    const nodes = new Map();
                    for (const [topic, value] of Object.entries(online ? topics : {})) {
                        if (!topic.startsWith(base)) continue;
                        const rest = topic.slice(base.length);
                        const name = rest.split("/")[0];
                        const node = nodes.get(name) ?? { name, topic: base + name, count: 0 };
                        if (rest.includes("/")) node.count++;
                        else node.value = value;
                        nodes.set(name, node);
                    }
                    toPi({ event: "topic-tree-result", requestId: p.requestId, prefix: p.prefix, nodes: [...nodes.values()] });
                } else if (p.event === "listen") {
                    setTimeout(() => toPi({ event: "listen-result", requestId: p.requestId, heard: [
                        { topic: "zigbee2mqtt/Wohnzimmer Lampe", value: '{"state":"OFF","brightness":180}', count: 1, busy: false },
                        { topic: "shellies/plug-kitchen/relay/0/power", value: "1234.5", count: 4, busy: true },
                    ] }), 1500);
                } else if (p.event === "test-switch") {
                    setTimeout(() => toPi({ event: "test-result", requestId: p.requestId, result: { outcome: "no-answer", sent: { topic: "cmnd/plug1/POWER", payload: "OFF" }, reported: "ON" } }), 1200);
                } else if (p.event === "devices") {
                    const haUp = scenario.ha.state === "online";
                    const all = [
                        ...(haUp ? [
                            { id: "light.flur", source: "ha", name: "Flur Deckenlicht", group: "Flur", sub: "light.flur", extra: false, icon: mdi.mdiCeilingLight, kinds: ["switch"] },
                            { id: "switch.kaffee", source: "ha", name: "Kaffeemaschine", group: "Küche", sub: "Steckdose Küche · switch.kaffee", extra: false, icon: mdi.mdiCoffeeMaker, kinds: ["switch"] },
                            { id: "lock.haustuer", source: "ha", name: "Haustür", group: "Flur", sub: "lock.haustuer", extra: false, icon: mdi.mdiLock, kinds: ["switch"] },
                            { id: "sensor.bad_temperatur", source: "ha", name: "Bad Temperatur", group: "Bad", sub: "Klima Bad · sensor.bad_temperatur", extra: false, icon: mdi.mdiThermometer, kinds: ["value"] },
                        ] : []),
                        ...(scenario.status.state === "online" ? [
                            { id: "0x01_light", source: "mqtt", name: "Flurlicht", group: "Flurlicht", sub: "light", extra: false, icon: mdi.mdiCeilingLight, kinds: ["switch", "slider"] },
                            { id: "0x04_plug", source: "mqtt", name: "Steckdose", group: "Kaffeemaschine", sub: "switch", extra: false, kinds: ["switch"] },
                            { id: "0x02_temp", source: "mqtt", name: "Temperatur", group: "Klima Bad", sub: "sensor", extra: false, icon: mdi.mdiThermometer, kinds: ["value"] },
                        ] : []),
                    ];
                    const words = String(p.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
                    const fitting = all.filter((e) => e.kinds.includes(p.action));
                    const items = fitting.filter((e) => words.every((w) => `${e.name} ${e.group} ${e.sub}`.toLowerCase().includes(w)));
                    const current = fitting.find((e) => e.source === p.current?.source && e.id === p.current?.id);
                    toPi({ event: "devices-result", requestId: p.requestId, items, total: fitting.length, matching: items.length, current, sources: { ha: haUp, mqtt: scenario.status.state !== "unconfigured" } });
                } else if (p.event === "device-apply") {
                    const settings = p.source === "ha"
                        ? { source: "ha", entityId: p.id, haEntity: "", label: "" }
                        : { source: "mqtt", entityId: "", haEntity: p.id, label: "Flurlicht", stateTopic: "zigbee2mqtt/Wohnzimmer Lampe", commandTopic: "zigbee2mqtt/Wohnzimmer Lampe/set", field: "state", template: '{"state":"{value}"}' };
                    toPi({ event: "device-apply-result", requestId: p.requestId, settings });
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
    // The settings window ("?window") borrows the PI's connection, as in Stream Deck
    if (file.endsWith(".html") && !u.searchParams.has("window")) {
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
