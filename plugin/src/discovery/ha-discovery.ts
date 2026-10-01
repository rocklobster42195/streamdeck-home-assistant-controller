// Home Assistant's MQTT discovery on the broker: HA-C listens to the (retained) config topics from
// the start; the device picker (../pi/devices.ts) lists what they announce.
import { broker } from "../mqtt/connection";
import { parseDiscovery, type HaEntity } from "./ha-entities";

const PREFIX = "homeassistant";
const CONFIG = /^homeassistant\/[^/]+\/(?:[^/]+\/)?[^/]+\/config$/;
const OWNER = "ha-discovery";

export function initHaDiscovery(): void {
    broker.subscribe(`${PREFIX}/+/+/config`, OWNER);
    broker.subscribe(`${PREFIX}/+/+/+/config`, OWNER);
}

/** Every entity announced on the broker right now. */
export function entities(): HaEntity[] {
    const out: HaEntity[] = [];
    for (const [topic, msg] of broker.topics()) {
        if (!CONFIG.test(topic)) continue;
        const e = parseDiscovery(topic, msg.payload);
        if (e) out.push(e);
    }
    return out;
}
