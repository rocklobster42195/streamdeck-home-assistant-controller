// Switch keys against an in-process broker (aedes) with invented devices: a zigbee2mqtt lamp that
// confirms commands, a Tasmota plug that never answers (the key goes back after 3 s), a Shelly
// that goes offline, and a key without a state topic. Also checks the settings panel's topic
// search and scheme suggestion, and HA-C's status on deckbus. Does not touch a real broker.
//   node tools/sd-sim/switch.mjs [outDir]
import { createServer } from "node:net";
import path from "node:path";
import { Aedes } from "aedes";
import { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { startSim } from "./sim.mjs";

const out = path.resolve(process.argv[2] ?? "sim-out", "switch");
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// The broker and its devices
const aedes = await Aedes.createBroker();
const server = createServer(aedes.handle);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const publish = (topic, payload, retain = true) => new Promise((r) => aedes.publish({ cmd: "publish", topic, payload: Buffer.from(payload), qos: 0, retain, dup: false }, () => r()));
const received = [];
aedes.on("publish", (packet, client) => {
    if (!client) return;
    received.push({ topic: packet.topic, payload: packet.payload.toString() });
    // The lamp confirms like zigbee2mqtt does: the new state on its state topic
    if (packet.topic === "zigbee2mqtt/Wohnzimmer Lampe/set") {
        const state = JSON.parse(packet.payload.toString()).state;
        setTimeout(() => publish("zigbee2mqtt/Wohnzimmer Lampe", JSON.stringify({ state, brightness: 180, linkquality: 120 })), 150);
    }
});
await publish("zigbee2mqtt/Wohnzimmer Lampe", JSON.stringify({ state: "OFF", brightness: 180, linkquality: 120 }));
await publish("zigbee2mqtt/Wohnzimmer Lampe/availability", JSON.stringify({ state: "online" }));
await publish("stat/plug1/POWER", "ON");
await publish("tele/plug1/SENSOR", JSON.stringify({ ENERGY: { Power: 42.3, Today: 1.2 } }));
await publish("shellyplus1-a8/status/switch:0", JSON.stringify({ id: 0, output: true, apower: 3.2 }));
await publish("shellyplus1-a8/online", "true");

const peer = new DeckBus({ id: "sim-listener", name: "Listener", version: "1", scanMs: 500 });
await peer.start();
await new Promise((r) => setTimeout(r, 1200));
const before = new Set(peer.peers().map((p) => p.slot));
const simHac = () => peer.peers().find((p) => p.name === "HA-C" && !before.has(p.slot));

const sim = await startSim({ language: "de", globalSettings: { brokerUrl: `127.0.0.1:${port}` } });
try {
    const lamp = sim.add(
        "switch",
        {
            stateTopic: "zigbee2mqtt/Wohnzimmer Lampe",
            commandTopic: "zigbee2mqtt/Wohnzimmer Lampe/set",
            field: "state",
            template: '{"state":"{value}"}',
            availabilityTopic: "zigbee2mqtt/Wohnzimmer Lampe/availability",
            label: "Wohnzimmer",
        },
        { column: 0 },
    );
    const plug = sim.add("switch", { stateTopic: "stat/plug1/POWER", commandTopic: "cmnd/plug1/POWER", label: "Steckdose", iconOn: "mdiPowerSocketEu", iconOff: "mdiPowerSocketEu", valueTopic: "tele/plug1/SENSOR", valueField: "ENERGY.Power", valueUnit: "W", valueDecimals: "0", colorOn: "#3ddc84", valueThresholds: [{ from: 1000, color: "#ff4d4d" }] }, { column: 1 });
    const shelly = sim.add(
        "switch",
        { stateTopic: "shellyplus1-a8/status/switch:0", commandTopic: "shellyplus1-a8/command/switch:0", field: "output", onValue: "true", offValue: "false", commandOn: "on", commandOff: "off", availabilityTopic: "shellyplus1-a8/online", label: "Shelly", colorOn: "#87AE73" },
        { column: 2 },
    );
    const blind = sim.add("switch", { commandTopic: "hac/test/gate", label: "Tor", iconOn: "mdiGarageOpen", iconOff: "mdiGarage" }, { column: 3 });
    const empty = sim.add("switch", {}, { column: 0, row: 1 });
    await sim.sleep(1500);
    await sim.snapshot(out, "1-start");
    check("the keys drew something", [lamp, plug, shelly, blind, empty].every((c) => sim.state.slots.get(c).image));

    // Lamp: press → ON published to …/set, the lamp confirms
    sim.press(lamp);
    await sim.waitFor(() => received.some((m) => m.topic === "zigbee2mqtt/Wohnzimmer Lampe/set"), 3000, "lamp command");
    const cmd = received.find((m) => m.topic === "zigbee2mqtt/Wohnzimmer Lampe/set");
    check("the lamp gets the template filled", cmd?.payload === '{"state":"ON"}', cmd?.payload);
    const onImage = sim.state.slots.get(lamp).image;

    // Plug: press → OFF to cmnd/…, no answer: shows off, then back to on after 3 s
    const plugBefore = sim.state.slots.get(plug).image;
    sim.press(plug);
    await sim.sleep(400);
    const plugOptimistic = sim.state.slots.get(plug).image;
    check("the plug gets OFF", received.some((m) => m.topic === "cmnd/plug1/POWER" && m.payload === "OFF"));
    check("the plug shows off at once", plugOptimistic !== plugBefore);
    await sim.snapshot(out, "2-pressed");
    await sim.sleep(3200);
    check("the plug goes back to on without an answer", sim.state.slots.get(plug).image === plugBefore);
    check("the lamp stays on (confirmed)", sim.state.slots.get(lamp).image === onImage);

    // Shelly Gen2: press sends "off" (its command value), then the device goes offline
    sim.press(shelly);
    await sim.sleep(300);
    check("the Shelly gets its own command value", received.some((m) => m.topic === "shellyplus1-a8/command/switch:0" && m.payload === "off"));
    await publish("shellyplus1-a8/online", "false");
    // Gate without a state topic: toggles by what it sent
    sim.press(blind);
    await sim.sleep(300);
    sim.press(blind);
    await sim.sleep(300);
    const gate = received.filter((m) => m.topic === "hac/test/gate").map((m) => m.payload);
    check("the gate toggles without a state topic", gate.join(",") === "ON,OFF", gate.join(","));
    await sim.snapshot(out, "3-offline");

    // Settings panel: topic search and the scheme suggestion
    sim.piOpen(lamp);
    sim.piSend(lamp, { event: "pi-ready" });
    await sim.sleep(500);
    const replies = [];
    const off = sim.onPiMessage((m) => replies.push(m));
    sim.piSend(lamp, { event: "topics", requestId: 1, query: "lampe" });
    sim.piSend(lamp, { event: "topic-info", requestId: 2, topic: "stat/plug1/POWER" });
    sim.piSend(lamp, { event: "topic-info", requestId: 3, topic: "zigbee2mqtt/Wohnzimmer Lampe" });
    await sim.waitFor(() => replies.filter((m) => m.requestId).length >= 3, 3000, "PI replies");
    off();
    const hits = replies.find((m) => m.requestId === 1);
    check("the topic search finds the lamp", hits?.hits?.some((h) => h.topic === "zigbee2mqtt/Wohnzimmer Lampe"), hits?.hits?.map((h) => h.topic).join(", "));
    const plugInfo = replies.find((m) => m.requestId === 2)?.info;
    check("Tasmota is recognised", plugInfo?.suggestion?.scheme === "tasmota" && plugInfo.suggestion.commandTopic === "cmnd/plug1/POWER", JSON.stringify(plugInfo?.suggestion));
    const lampInfo = replies.find((m) => m.requestId === 3)?.info;
    check("the lamp's JSON fields are listed", lampInfo?.fields?.some((f) => f.path === "state"), lampInfo?.fields?.map((f) => f.path).join(", "));
    const status = sim.state.piMessages.find((m) => m.event === "status");
    check("the panel gets the connection status", status?.status?.state === "online", JSON.stringify(status?.status));

    // Browse, Listen and Test against the real plugin
    const more = [];
    const off2 = sim.onPiMessage((m) => more.push(m));
    sim.piSend(lamp, { event: "topic-tree", requestId: 11, prefix: "" });
    sim.piSend(lamp, { event: "topic-tree", requestId: 12, prefix: "zigbee2mqtt" });
    sim.piSend(lamp, { event: "listen", requestId: 13, ms: 1500 });
    await sim.sleep(300);
    await publish("zigbee2mqtt/Wohnzimmer Lampe", JSON.stringify({ state: "OFF", brightness: 180, linkquality: 120 }), false);
    await sim.waitFor(() => more.some((m) => m.requestId === 13), 4000, "listen result");
    sim.piSend(lamp, { event: "test-switch", requestId: 14, settings: { stateTopic: "zigbee2mqtt/Wohnzimmer Lampe", commandTopic: "zigbee2mqtt/Wohnzimmer Lampe/set", field: "state", template: '{"state":"{value}"}' } });
    sim.piSend(lamp, { event: "test-switch", requestId: 15, settings: { stateTopic: "stat/plug1/POWER", commandTopic: "cmnd/plug1/POWER" } });
    await sim.waitFor(() => [11, 12, 13, 14, 15].every((id) => more.some((m) => m.requestId === id)), 6000, "explore replies");
    off2();
    const roots = more.find((m) => m.requestId === 11)?.nodes?.map((n) => n.name) ?? [];
    check("the tree lists the roots", ["zigbee2mqtt", "stat", "shellyplus1-a8"].every((r) => roots.includes(r)), roots.join(","));
    const z = more.find((m) => m.requestId === 12)?.nodes ?? [];
    check("a tree level shows its topics with values", z.some((n) => n.name === "Wohnzimmer Lampe" && n.value?.includes("state")), JSON.stringify(z[0]));
    const heard = more.find((m) => m.requestId === 13)?.heard ?? [];
    check("listening hears the lamp", heard[0]?.topic === "zigbee2mqtt/Wohnzimmer Lampe", JSON.stringify(heard));
    const t1 = more.find((m) => m.requestId === 14)?.result;
    check("test: the lamp confirms", t1?.outcome === "confirmed" && t1.sent?.payload === '{"state":"ON"}', JSON.stringify(t1));
    const t2 = more.find((m) => m.requestId === 15)?.result;
    check("test: the silent plug gets no answer", t2?.outcome === "no-answer" && t2.sent?.topic === "cmnd/plug1/POWER", JSON.stringify(t2));

    // deckbus
    await sim.waitFor(() => simHac()?.state.status, 10000, "HA-C on the bus");
    const hac = simHac();
    check("HA-C reports the broker on deckbus", hac.state.status.online === true, JSON.stringify(hac.state.status));
    check("HA-C shares its visible keys", hac.state.actions?.length === 5, JSON.stringify(hac.state.actions?.length));

    // Broker gone: every key greys out
    for (const c of aedes.connectedClients ? Object.values(aedes.clients) : []) c.close();
    server.close();
    await sim.sleep(800);
    await sim.snapshot(out, "4-broker-gone");
    check("the keys show offline without the broker", sim.state.slots.get(lamp).image !== onImage);
} catch (e) {
    check("scenario ran", false, e.message);
} finally {
    await sim.stop();
    peer.stop();
    aedes.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
console.log(`snapshots in ${out}`);
process.exit(failed ? 1 : 0);
