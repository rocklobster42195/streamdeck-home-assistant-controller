// zigbee2mqtt keeps no device state on the broker (retain is off by default), so a key would show
// "unknown" until the device reports by itself. For zigbee2mqtt-style topics (commands go to
// <state topic>/set) HA-C can ask for the state through <state topic>/get; that only reads.

/** The request that makes a zigbee2mqtt device report its state; undefined for other topics. */
export function stateRequest(stateTopic: string | undefined, commandTopic: string | undefined): { topic: string; payload: string } | undefined {
    const st = stateTopic?.trim();
    if (!st || /[#+]/.test(st) || commandTopic?.trim() !== `${st}/set`) return undefined;
    return { topic: `${st}/get`, payload: '{"state":""}' };
}

/**
 * zigbee2mqtt announces the bridge's availability (`<base>/bridge/state`) and, only when per-device
 * availability is configured for it, the device's own. A device announced with the bridge alone
 * still gets `<state topic>/availability` (unused when it never arrives, so it costs nothing).
 */
export function deviceAvailability(topic: string, stateTopic: string | undefined): string {
    const m = /^(.+)\/bridge\/state$/.exec(topic);
    const st = stateTopic?.trim();
    return m && st?.startsWith(`${m[1]}/`) && !st.startsWith(`${m[1]}/bridge/`) ? `${st}/availability` : topic;
}
