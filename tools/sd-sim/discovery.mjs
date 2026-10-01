// Home Assistant discovery against an in-process broker (aedes): invented zigbee2mqtt devices
// announce themselves; the settings panel lists the fitting ones, picking fills the settings, and
// the key or dial then works with them. Does not touch a real broker.
//   node tools/sd-sim/discovery.mjs [outDir]
import { createServer } from "node:net";
import path from "node:path";
import { Aedes } from "aedes";
import { startSim } from "./sim.mjs";

const out = path.resolve(process.argv[2] ?? "sim-out", "discovery");
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const aedes = await Aedes.createBroker();
const server = createServer(aedes.handle);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const publish = (topic, payload, retain = true) => new Promise((r) => aedes.publish({ cmd: "publish", topic, payload: Buffer.from(payload), qos: 0, retain, dup: false }, () => r()));
const lamp = { state: "OFF", brightness: 100 };
const received = [];
aedes.on("publish", (packet, client) => {
    if (!client) return;
    received.push({ topic: packet.topic, payload: packet.payload.toString() });
    if (packet.topic === "zigbee2mqtt/Flurlicht/set") {
        Object.assign(lamp, JSON.parse(packet.payload.toString()));
        setTimeout(() => publish("zigbee2mqtt/Flurlicht", JSON.stringify(lamp)), 100);
    }
});
const avail = [{ topic: "zigbee2mqtt/bridge/state", value_template: "{{ value_json.state }}" }, { topic: "zigbee2mqtt/Flurlicht/availability", value_template: "{{ value_json.state }}" }];
const device = { identifiers: ["zigbee2mqtt_0x01"], manufacturer: "Philips", model: "Hue white", name: "Flurlicht" };
await publish("homeassistant/light/0x01/light/config", JSON.stringify({ availability: avail, brightness: true, brightness_scale: 254, command_topic: "zigbee2mqtt/Flurlicht/set", device, name: null, schema: "json", state_topic: "zigbee2mqtt/Flurlicht", unique_id: "0x01_light", icon: "mdi:ceiling-light" }));
await publish("homeassistant/sensor/0x01/linkquality/config", JSON.stringify({ availability: avail, device, name: "Linkquality", state_topic: "zigbee2mqtt/Flurlicht", value_template: '{{ value_json["linkquality"] }}', unit_of_measurement: "lqi", entity_category: "diagnostic", unique_id: "0x01_lqi" }));
await publish("homeassistant/sensor/0x02/temperature/config", JSON.stringify({ device: { identifiers: ["z_0x02"], name: "Klima Bad" }, name: "Temperatur", state_topic: "zigbee2mqtt/Klima Bad", value_template: "{{ value_json.temperature }}", unit_of_measurement: "°C", unique_id: "0x02_temp" }));
await publish("zigbee2mqtt/Flurlicht", JSON.stringify(lamp));
await publish("zigbee2mqtt/Flurlicht/availability", JSON.stringify({ state: "online" }));
await publish("zigbee2mqtt/Klima Bad", JSON.stringify({ temperature: 22.4 }));

const sim = await startSim({ language: "de", globalSettings: { brokerUrl: `127.0.0.1:${port}` } });
try {
    const key = sim.add("switch", {}, { column: 0 });
    const val = sim.add("value", {}, { column: 1 });
    const dial = sim.add("slider", {}, { column: 0, controller: "Encoder" });
    await sim.sleep(1200);
    const replies = [];
    const off = sim.onPiMessage((m) => replies.push(m));
    const ask = async (ctx, msg) => {
        sim.piSend(ctx, msg);
        await sim.waitFor(() => replies.some((m) => m.requestId === msg.requestId), 3000, msg.event);
        return replies.find((m) => m.requestId === msg.requestId);
    };
    sim.piOpen(key);
    const sw = await ask(key, { event: "devices", requestId: 1, action: "switch", query: "" });
    check("the switch list has the light only", sw.items.length === 1 && sw.items[0].name === "Flurlicht" && sw.total === 1 && sw.items[0].source === "mqtt", JSON.stringify(sw.items.map((i) => i.name)));
    const vs = await ask(val, { event: "devices", requestId: 2, action: "value", query: "" });
    check("the value list is grouped by device, diagnostics marked", vs.items.map((i) => i.name).join(",") === "Linkquality,Temperatur" && vs.items[0].extra, JSON.stringify(vs.items));
    const found = await ask(val, { event: "devices", requestId: 3, action: "value", query: "bad" });
    check("searching finds by device name", found.items.length === 1 && found.items[0].name === "Temperatur");

    const applied = await ask(key, { event: "device-apply", requestId: 4, action: "switch", source: "mqtt", id: "0x01_light" });
    sim.setSettings(key, applied.settings);
    const temp = await ask(val, { event: "device-apply", requestId: 5, action: "value", source: "mqtt", id: "0x02_temp" });
    sim.setSettings(val, temp.settings);
    const bri = await ask(dial, { event: "device-apply", requestId: 6, action: "slider", source: "mqtt", id: "0x01_light" });
    sim.setSettings(dial, bri.settings);
    off();
    await sim.sleep(600);
    await sim.snapshot(out, "1-from-discovery");

    sim.press(key);
    await sim.waitFor(() => lamp.state === "ON", 3000, "lamp on");
    check("the key from discovery switches the light", lamp.state === "ON");
    sim.rotate(dial, 5);
    await sim.sleep(600);
    check("the dial from discovery sets the brightness (100 + 5 × 10)", lamp.brightness === 150, String(lamp.brightness));
    await sim.snapshot(out, "2-on");
} catch (e) {
    check("scenario ran", false, e.message);
} finally {
    await sim.stop();
    aedes.close();
    server.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
console.log(`snapshots in ${out}`);
process.exit(failed ? 1 : 0);
