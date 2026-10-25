// Staged picture for the README: the real plugin against an in-process MQTT broker (aedes) with
// invented lamps, sensors and a blind. Does not touch a real Home Assistant or broker.
// Run it with DECKBUS_NAMESPACE=showcase, so the plugin does not meet the plugins running on this computer.
//   node tools/sd-sim/showcase.mjs [outDir]       → <outDir>/showcase/overview.png
import { createServer } from "node:net";
import path from "node:path";
import { Aedes } from "aedes";
import { startSim } from "./sim.mjs";

const out = path.resolve(process.argv[2] ?? "sim-out", "showcase");

const aedes = await Aedes.createBroker();
const server = createServer(aedes.handle);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const publish = (topic, payload) => new Promise((r) => aedes.publish({ cmd: "publish", topic, payload: Buffer.from(payload), qos: 0, retain: true, dup: false }, () => r()));

await publish("zigbee2mqtt/Living Room Lamp", JSON.stringify({ state: "ON", brightness: 180 }));
await publish("zigbee2mqtt/Living Room Lamp/availability", JSON.stringify({ state: "online" }));
await publish("zigbee2mqtt/Reading Lamp", JSON.stringify({ state: "OFF", brightness: 120 }));
await publish("zigbee2mqtt/Reading Lamp/availability", JSON.stringify({ state: "online" }));
await publish("zigbee2mqtt/Living Room Climate", JSON.stringify({ temperature: 21.4, humidity: 48 }));
await publish("shellies/plug-kitchen/relay/0", "on");
await publish("shellies/plug-kitchen/relay/0/power", "1234.5");
await publish("home/co2", "780");
await publish("home/thermostat/setpoint", "21.0");
await publish("home/thermostat/temperature", "19.4");
await publish("home/blind/position", "60");
await publish("zigbee2mqtt/Dining Lamp", JSON.stringify({ state: "ON", brightness: 128 }));
await publish("zigbee2mqtt/Terrace Lamp", JSON.stringify({ state: "ON", brightness: 220 }));

const sim = await startSim({ language: "en", globalSettings: { brokerUrl: `127.0.0.1:${port}` } });
const enc = { controller: "Encoder" };
try {
    const lamp = (name, column) => ({ stateTopic: `zigbee2mqtt/${name}`, commandTopic: `zigbee2mqtt/${name}/set`, field: "state", template: '{"state":"{value}"}', availabilityTopic: `zigbee2mqtt/${name}/availability`, label: name.replace(" Lamp", ""), column });
    for (const [name, column] of [["Living Room Lamp", 0], ["Reading Lamp", 1]]) {
        const { column: c, ...settings } = lamp(name, column);
        sim.add("switch", settings, { column: c });
    }
    const climate = { stateTopic: "zigbee2mqtt/Living Room Climate", field: "temperature", unit: "°C", decimals: "1", color: "#6cc4ff", thresholds: [{ from: 18, color: "#3ddc84" }, { from: 23, color: "#f5c542" }, { from: 25, color: "#ff4d4d" }] };
    sim.add("value", { ...climate, label: "Living Room", icon: "mdiThermometer" }, { column: 2 });
    sim.add("value", { ...climate, look: "gauge", min: "10", max: "30", label: "Living Room" }, { column: 3 });
    sim.add("value", { stateTopic: "home/co2", unit: "ppm", decimals: "0", look: "open", min: "400", max: "1600", icon: "mdiMoleculeCo2", thresholds: [{ from: 400, color: "#3ddc84" }, { from: 1000, color: "#f5c542" }, { from: 1400, color: "#ff4d4d" }] }, { column: 0, row: 1 });
    sim.add("value", { stateTopic: "shellies/plug-kitchen/relay/0/power", unit: "W", decimals: "0", label: "Kitchen", thresholds: [{ from: 1000, color: "#ff4d4d" }], pressAction: "toggle", pressStateTopic: "shellies/plug-kitchen/relay/0", pressCommandTopic: "shellies/plug-kitchen/relay/0/command" }, { column: 1, row: 1 });
    sim.add("switch", { commandTopic: "hac/showcase/gate", label: "Garage", iconOn: "mdiGarageOpen", iconOff: "mdiGarage" }, { column: 2, row: 1 });
    sim.add("publish", { topic: "hac/showcase/scene", payload: '{"scene":"movie"}', label: "Movie", icon: "mdiMovieOpen" }, { column: 3, row: 1 });

    sim.add("slider", { stateTopic: "zigbee2mqtt/Dining Lamp", field: "brightness", commandTopic: "zigbee2mqtt/Dining Lamp/set", template: '{"brightness":{value}}', min: "0", max: "254", step: "10", label: "Dining", percent: true, panoramaMember: true }, { column: 0, ...enc });
    sim.add("slider", { stateTopic: "home/thermostat/setpoint", commandTopic: "home/thermostat/setpoint/set", min: "15", max: "26", step: "0.5", unit: "°C", actualTopic: "home/thermostat/temperature", label: "Bathroom", color: "#6cc4ff", panoramaMember: true }, { column: 1, ...enc });
    sim.add("slider", { stateTopic: "home/blind/position", commandTopic: "home/blind/set", unit: "%", look: "ring", label: "Blind", icon: "mdiBlindsHorizontal", panoramaMember: true }, { column: 2, ...enc });
    sim.add("slider", { stateTopic: "zigbee2mqtt/Terrace Lamp", field: "brightness", commandTopic: "zigbee2mqtt/Terrace Lamp/set", template: '{"brightness":{value}}', min: "0", max: "254", step: "10", label: "Terrace", percent: true, panoramaMember: true }, { column: 3, ...enc });
    await sim.sleep(6000);
    console.log("wrote", await sim.snapshot(out, "overview"));
} finally {
    await sim.stop();
    aedes.close();
    server.close();
}
process.exit(0);
