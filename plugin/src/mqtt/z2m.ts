// zigbee2mqtt keeps no device state on the broker (retain is off by default), so a key would show
// "unknown" until the device reports by itself. For zigbee2mqtt-style topics (commands go to
// <state topic>/set) HA-C can ask for the state through <state topic>/get; that only reads.
// Availability follows the discovery config, as in HA (see discovery/ha-config.ts).

/** The request that makes a zigbee2mqtt device report its state; undefined for other topics. */
export function stateRequest(stateTopic: string | undefined, commandTopic: string | undefined): { topic: string; payload: string } | undefined {
    const st = stateTopic?.trim();
    if (!st || /[#+]/.test(st) || commandTopic?.trim() !== `${st}/set`) return undefined;
    return { topic: `${st}/get`, payload: '{"state":""}' };
}
