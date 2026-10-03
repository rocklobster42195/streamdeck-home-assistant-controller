// Value keys against an in-process broker (aedes) with invented sensors: a zigbee2mqtt climate
// sensor (JSON), a plug's power (plain number), a door (text), in both looks with colour ranges;
// then the temperature rises across a threshold and the sensor goes offline. Writes deck snapshots.
//   node tools/sd-sim/value.mjs [outDir]
import { createServer } from "node:net";
import path from "node:path";
import { Aedes } from "aedes";
import { startSim } from "./sim.mjs";

const out = path.resolve(process.argv[2] ?? "sim-out", "value");
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
await publish("zigbee2mqtt/Wohnzimmer Klima", JSON.stringify({ temperature: 21.37, humidity: 48.2, battery: 91 }));
await publish("zigbee2mqtt/Wohnzimmer Klima/availability", JSON.stringify({ state: "online" }));
await publish("shellies/plug-kitchen/relay/0/power", "1234.5");
await publish("home/door/state", "open");
await publish("shellies/plug-kitchen/relay/0", "on");
const received = [];
aedes.on("publish", (packet, client) => {
    if (!client) return;
    received.push({ topic: packet.topic, payload: packet.payload.toString() });
    // The plug confirms like a Shelly Gen1 does
    if (packet.topic === "shellies/plug-kitchen/relay/0/command") setTimeout(() => publish("shellies/plug-kitchen/relay/0", packet.payload.toString()), 150);
});

const climate = [
    { from: 18, color: "#3ddc84" },
    { from: 23, color: "#f5c542" },
    { from: 25, color: "#ff4d4d" },
];
const sim = await startSim({ language: "de", globalSettings: { brokerUrl: `127.0.0.1:${port}` } });
try {
    const common = { stateTopic: "zigbee2mqtt/Wohnzimmer Klima", field: "temperature", unit: "°C", decimals: "1", color: "#6cc4ff", thresholds: climate, availabilityTopic: "zigbee2mqtt/Wohnzimmer Klima/availability" };
    const tText = sim.add("value", { ...common, label: "Wohnzimmer", icon: "mdiThermometer" }, { column: 0 });
    const tGauge = sim.add("value", { ...common, look: "gauge", min: "10", max: "30", label: "Wohnzimmer" }, { column: 1 });
    const hum = sim.add("value", { stateTopic: "zigbee2mqtt/Wohnzimmer Klima", field: "humidity", unit: "%", decimals: "0", look: "gauge", min: "0", max: "100", icon: "mdiWaterPercent", thresholds: [{ from: 40, color: "#3ddc84" }, { from: 60, color: "#6cc4ff" }], color: "#f5c542" }, { column: 2 });
    const power = sim.add(
        "value",
        {
            stateTopic: "shellies/plug-kitchen/relay/0/power",
            unit: "W",
            decimals: "0",
            label: "Küche",
            thresholds: [{ from: 1000, color: "#ff4d4d" }],
            pressAction: "toggle",
            pressStateTopic: "shellies/plug-kitchen/relay/0",
            pressCommandTopic: "shellies/plug-kitchen/relay/0/command",
        },
        { column: 3 },
    );
    // The horseshoe look with colour ranges as bands (like a CO2 key)
    sim.add("value", { stateTopic: "zigbee2mqtt/Wohnzimmer Klima", field: "humidity", unit: "%", decimals: "0", look: "open", min: "0", max: "100", icon: "mdiBed", thresholds: [{ from: 40, color: "#f5c542" }, { from: 60, color: "#ff5a5a" }], color: "#3ddc84" }, { column: 3, row: 1 });
    const door = sim.add("value", { stateTopic: "home/door/state", label: "Haustür", icon: "mdiDoor", pressAction: "send", sendTopic: "hac/test/door/open", sendPayload: '{"open":true}' }, { column: 0, row: 1 });
    const missing = sim.add("value", { stateTopic: "nothing/here", label: "Leer", unit: "°C" }, { column: 1, row: 1 });
    sim.add("value", {}, { column: 2, row: 1 });
    await sim.sleep(1500);
    await sim.snapshot(out, "1-values");
    check("every key drew something", [tText, tGauge, hum, power, door, missing].every((c) => sim.state.slots.get(c).image));

    // Press actions: the power key switches the plug (framed while on), the door key sends
    const framed = sim.state.slots.get(power).image;
    sim.press(power);
    await sim.waitFor(() => received.some((m) => m.topic === "shellies/plug-kitchen/relay/0/command"), 3000, "plug command");
    const plugCmd = received.find((m) => m.topic === "shellies/plug-kitchen/relay/0/command");
    check("the value key switches the plug off in its own words", plugCmd?.payload === "off", plugCmd?.payload);
    await sim.sleep(500);
    check("the frame goes when the plug is off", sim.state.slots.get(power).image !== framed);
    sim.press(door);
    await sim.sleep(300);
    check("the door key sends its payload", received.some((m) => m.topic === "hac/test/door/open" && m.payload === '{"open":true}'));
    check("the door key confirms", sim.state.slots.get(door).oks === 1);
    sim.press(power);
    await sim.sleep(500);
    check("the frame comes back", sim.state.slots.get(power).image === framed);

    const before = sim.state.slots.get(tGauge).image;
    await publish("zigbee2mqtt/Wohnzimmer Klima", JSON.stringify({ temperature: 26.1, humidity: 48.2, battery: 91 }));
    await sim.sleep(500);
    check("the gauge follows a new value", sim.state.slots.get(tGauge).image !== before);
    await sim.snapshot(out, "2-warm");

    const warm = sim.state.slots.get(tText).image;
    await publish("zigbee2mqtt/Wohnzimmer Klima/availability", JSON.stringify({ state: "offline" }));
    await sim.sleep(500);
    check("offline changes the look", sim.state.slots.get(tText).image !== warm);
    await sim.snapshot(out, "3-offline");
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
