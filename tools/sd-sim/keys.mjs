// Publish and Multi-state keys against an in-process broker (aedes): a scene key, a gate with
// confirmation (two presses), and a zigbee2mqtt fan that steps off → low → medium → high and
// confirms. Writes deck snapshots. Does not touch a real broker.
//   node tools/sd-sim/keys.mjs [outDir]
import { createServer } from "node:net";
import path from "node:path";
import { Aedes } from "aedes";
import { startSim } from "./sim.mjs";

const out = path.resolve(process.argv[2] ?? "sim-out", "keys");
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
const received = [];
aedes.on("publish", (packet, client) => {
    if (!client) return;
    received.push({ topic: packet.topic, payload: packet.payload.toString() });
    if (packet.topic === "zigbee2mqtt/Ventilator/set") {
        const mode = JSON.parse(packet.payload.toString()).fan_mode;
        setTimeout(() => publish("zigbee2mqtt/Ventilator", JSON.stringify({ fan_mode: mode, linkquality: 90 })), 150);
    }
});
await publish("zigbee2mqtt/Ventilator", JSON.stringify({ fan_mode: "off", linkquality: 90 }));

const sim = await startSim({ language: "de", globalSettings: { brokerUrl: `127.0.0.1:${port}` } });
try {
    const scene = sim.add("publish", { topic: "hac/test/scene", payload: '{"scene":"Kino"}', label: "Kino", icon: "mdiMovieOpen", color: "#E14190" }, { column: 0 });
    const gate = sim.add("publish", { topic: "hac/test/gate", payload: "OPEN", label: "Tor", icon: "mdiGate", confirm: true }, { column: 1 });
    const fan = sim.add(
        "multi-state",
        {
            stateTopic: "zigbee2mqtt/Ventilator",
            commandTopic: "zigbee2mqtt/Ventilator/set",
            field: "fan_mode",
            template: '{"fan_mode":"{value}"}',
            states: [
                { value: "off", label: "Aus", icon: "mdiFanOff", color: "#7a7a80" },
                { value: "low", label: "Stufe 1", icon: "mdiFanSpeed1", color: "#3ddc84" },
                { value: "medium", label: "Stufe 2", icon: "mdiFanSpeed2", color: "#f5c542" },
                { value: "high", label: "Stufe 3", icon: "mdiFanSpeed3", color: "#ff4d4d" },
            ],
        },
        { column: 2 },
    );
    const empty = sim.add("multi-state", { stateTopic: "zigbee2mqtt/Ventilator" }, { column: 3 });
    await sim.sleep(1500);
    await sim.snapshot(out, "1-start");
    check("every key drew something", [scene, gate, fan, empty].every((c) => sim.state.slots.get(c).image));

    sim.press(scene);
    await sim.sleep(300);
    check("the scene key sends its payload", received.some((m) => m.topic === "hac/test/scene" && m.payload === '{"scene":"Kino"}'));
    check("the scene key confirms", sim.state.slots.get(scene).oks === 1);

    sim.press(gate);
    await sim.sleep(300);
    check("the gate does not send on the first press", !received.some((m) => m.topic === "hac/test/gate"));
    await sim.snapshot(out, "2-armed");
    sim.press(gate);
    await sim.sleep(300);
    check("the gate sends on the second press", received.filter((m) => m.topic === "hac/test/gate").length === 1);
    sim.press(gate);
    await sim.sleep(3300);
    check("an armed gate disarms after 3 s", received.filter((m) => m.topic === "hac/test/gate").length === 1);

    for (const want of ["low", "medium", "high", "off"]) {
        sim.press(fan);
        await sim.waitFor(() => received.some((m) => m.topic === "zigbee2mqtt/Ventilator/set" && m.payload.includes(`"${want}"`)), 3000, `fan ${want}`);
        await sim.sleep(400);
        if (want === "medium") await sim.snapshot(out, "3-fan-medium");
    }
    const modes = received.filter((m) => m.topic === "zigbee2mqtt/Ventilator/set").map((m) => JSON.parse(m.payload).fan_mode);
    check("the fan steps through all states and wraps", modes.join(",") === "low,medium,high,off", modes.join(","));
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
