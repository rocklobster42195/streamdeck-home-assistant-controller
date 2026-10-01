// Slider dials against an in-process broker (aedes): a zigbee2mqtt lamp (rotate: brightness, push:
// on/off), a thermostat (setpoint in 0.5 steps, the room temperature on the arc) and a blind in
// the ring look. Checks that fast turning sends only the latest values. Writes deck snapshots.
//   node tools/sd-sim/dial.mjs [outDir]
import { createServer } from "node:net";
import path from "node:path";
import { Aedes } from "aedes";
import { startSim } from "./sim.mjs";

const out = path.resolve(process.argv[2] ?? "sim-out", "dial");
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
const lamp = { state: "ON", brightness: 128 };
const received = [];
aedes.on("publish", (packet, client) => {
    if (!client) return;
    const payload = packet.payload.toString();
    received.push({ topic: packet.topic, payload });
    // The lamp confirms like zigbee2mqtt; the thermostat echoes its setpoint
    if (packet.topic === "zigbee2mqtt/Esstisch/set") {
        Object.assign(lamp, JSON.parse(payload));
        setTimeout(() => publish("zigbee2mqtt/Esstisch", JSON.stringify(lamp)), 120);
    }
    if (packet.topic === "home/thermostat/setpoint/set") setTimeout(() => publish("home/thermostat/setpoint", payload), 120);
});
await publish("zigbee2mqtt/Esstisch", JSON.stringify(lamp));
await publish("home/thermostat/setpoint", "21.0");
await publish("home/thermostat/temperature", "19.4");
await publish("home/blind/position", "60");

const sim = await startSim({ language: "de", globalSettings: { brokerUrl: `127.0.0.1:${port}` } });
const enc = { controller: "Encoder" };
try {
    const light = sim.add(
        "slider",
        {
            stateTopic: "zigbee2mqtt/Esstisch",
            field: "brightness",
            commandTopic: "zigbee2mqtt/Esstisch/set",
            template: '{"brightness":{value}}',
            min: "0",
            max: "254",
            step: "10",
            label: "Esstisch",
            percent: true,
            pressAction: "toggle",
            pressStateTopic: "zigbee2mqtt/Esstisch",
            pressField: "state",
            pressCommandTopic: "zigbee2mqtt/Esstisch/set",
            pressTemplate: '{"state":"{value}"}',
        },
        { column: 0, ...enc },
    );
    const thermo = sim.add(
        "slider",
        {
            stateTopic: "home/thermostat/setpoint",
            commandTopic: "home/thermostat/setpoint/set",
            min: "15",
            max: "26",
            step: "0.5",
            unit: "°C",
            actualTopic: "home/thermostat/temperature",
            label: "Bad",
            color: "#6cc4ff",
            thresholds: [
                { from: 19, color: "#3ddc84" },
                { from: 23, color: "#f5c542" },
                { from: 24.5, color: "#ff4d4d" },
            ],
        },
        { column: 1, ...enc },
    );
    const blind = sim.add("slider", { stateTopic: "home/blind/position", commandTopic: "home/blind/set", unit: "%", look: "ring", label: "Rollladen", icon: "mdiBlindsHorizontal" }, { column: 2, ...enc });
    const empty = sim.add("slider", {}, { column: 3, ...enc });
    await sim.sleep(1500);
    await sim.snapshot(out, "1-start");
    check("every dial drew something", [light, thermo, blind, empty].every((c) => sim.state.slots.get(c).feedback?.["full-canvas"]));

    // Turn the lamp fast: 6 ticks within ~120 ms
    for (let i = 0; i < 6; i++) {
        sim.rotate(light, 1);
        await sim.sleep(20);
    }
    await sim.sleep(600);
    const sent = received.filter((m) => m.topic === "zigbee2mqtt/Esstisch/set" && m.payload.includes("brightness")).map((m) => JSON.parse(m.payload).brightness);
    check("fast turning sends only a few values", sent.length >= 1 && sent.length <= 3, sent.join(","));
    check("the last value arrives (130 + 6 × 10)", sent.at(-1) === 190 && lamp.brightness === 190, `${sent.at(-1)} / ${lamp.brightness}`);

    sim.dialPress(light);
    await sim.waitFor(() => lamp.state === "OFF", 3000, "lamp off");
    await sim.sleep(400);
    check("push switches the lamp off", lamp.state === "OFF");
    sim.touch(thermo);

    sim.rotate(thermo, 3);
    await sim.sleep(250);
    await sim.snapshot(out, "2-adjusting");
    await sim.sleep(600);
    const sp = received.filter((m) => m.topic === "home/thermostat/setpoint/set").map((m) => m.payload);
    check("the thermostat gets 22.5 in 0.5 steps", sp.at(-1) === "22.5", sp.join(","));
    await sim.sleep(1500);
    await sim.snapshot(out, "3-settled");

    sim.rotate(blind, -2);
    await sim.sleep(400);
    check("the blind gets its position", received.some((m) => m.topic === "home/blind/set" && m.payload === "58"));
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
