// Helping the user find and check topics from the settings panel: the topic tree, "Listen" (operate
// the device, see which topics change) and "Test" (switch once and see whether the device answers).
// Test publishes to the real broker, but only on the user's explicit click.
import streamDeck from "@elgato/streamdeck";
import { piBridge, type PiPushMessage } from "@rocklobster42195/streamdeck-kit/bridge";
import { broker } from "../mqtt/connection";
import { switchCommand, switchState, type SwitchTopics } from "../mqtt/switch-state";
import { Listener, treeLevel } from "../mqtt/topic-tree";
import type { PiPush, TestResult } from "./protocol";

const MAX_LISTEN_MS = 30_000;
const TEST_MS = 3000;

export function initExplore(): void {
    piBridge.handle("topic-tree", async (msg) => {
        const prefix = String(msg.prefix ?? "");
        await reply({ event: "topic-tree-result", requestId: msg.requestId as number, prefix, nodes: treeLevel(broker.topics(), prefix, preview) });
    });

    piBridge.handle("listen", async (msg) => {
        const ms = Math.min(MAX_LISTEN_MS, Math.max(1000, Number(msg.ms) || 10_000));
        const listener = new Listener();
        listener.start(broker.topics());
        const off = broker.onMessage((topic, m) => listener.add(topic, m));
        await new Promise((r) => setTimeout(r, ms));
        off();
        await reply({ event: "listen-result", requestId: msg.requestId as number, heard: listener.result(preview) });
    });

    piBridge.handle("test-switch", async (msg) => {
        const result = await testSwitch((msg.settings ?? {}) as SwitchTopics);
        await reply({ event: "test-result", requestId: msg.requestId as number, result });
    });
}

/** Switch once to the other state and wait up to 3 s for the state topic to report it. */
async function testSwitch(s: SwitchTopics): Promise<TestResult> {
    if (broker.state !== "online") return { outcome: "offline" };
    const stateTopic = s.stateTopic?.trim();
    const payloadNow = stateTopic ? broker.value(stateTopic)?.payload : undefined;
    const turnOn = switchState(s, payloadNow) !== "on";
    const cmd = switchCommand(s, turnOn, payloadNow);
    if (!cmd) return { outcome: "no-topic" };
    const want = turnOn ? "on" : "off";
    const started = Date.now();
    const confirmed = stateTopic
        ? new Promise<boolean>((resolve) => {
              const timer = setTimeout(() => {
                  off();
                  resolve(false);
              }, TEST_MS);
              const off = broker.onMessage((topic, m) => {
                  if (topic !== stateTopic || switchState(s, m.payload) !== want) return;
                  clearTimeout(timer);
                  off();
                  resolve(true);
              });
          })
        : Promise.resolve(false);
    broker.publish(cmd.topic, cmd.payload);
    streamDeck.logger.info(`[test] ${cmd.topic} ← ${cmd.payload}`);
    const ok = await confirmed;
    return { sent: cmd, outcome: ok ? "confirmed" : "no-answer", reported: stateTopic ? preview(broker.value(stateTopic)?.payload ?? "") : undefined, ms: ok ? Date.now() - started : undefined };
}

function preview(payload: string): string {
    const p = payload.replace(/\s+/g, " ").trim();
    return p.length > 80 ? `${p.slice(0, 79)}…` : p;
}

function reply(msg: PiPush): Promise<void> {
    return piBridge.reply(msg as unknown as PiPushMessage);
}
