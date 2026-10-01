// Every key has a source: a Home Assistant entity or MQTT topics. Keys from before HA-C had
// sources have topics and stay MQTT; a new key starts with Home Assistant when HA is set up.

export type Source = "ha" | "mqtt";

export type SourceSettings = {
    source?: Source;
    /** The HA entity ("light.desk") of a key with the HA source. */
    entityId?: string;
    /** No name on the key, not even HA's. */
    hideLabel?: boolean;
};

/**
 * The name under the icon: the key's own, else the HA entity's (`fallback`); none with "hideLabel".
 */
export function keyLabel(s: { label?: string; hideLabel?: boolean }, fallback?: string): string | undefined {
    if (s.hideLabel) return undefined;
    return s.label?.trim() || fallback;
}

export function sourceOf(s: SourceSettings & { stateTopic?: unknown; commandTopic?: unknown; topic?: unknown }, haSetUp: boolean): Source {
    if (s.source === "ha" || s.source === "mqtt") return s.source;
    const hasTopic = [s.stateTopic, s.commandTopic, s.topic].some((t) => typeof t === "string" && t.trim() !== "");
    return !hasTopic && haSetUp ? "ha" : "mqtt";
}
