// HAC's messages between the plugin and its property inspectors (shared by both sides). The kit
// handles "pi-ready", "options" and "options-result" itself.
import type { FoundHa } from "../ha/zeroconf";
import type { HaState } from "../ha/ha-connection";
import type { BrokerState } from "../mqtt/broker";
import type { TopicSuggestion } from "../mqtt/schemes";
import type { SwitchTopics } from "../mqtt/switch-state";
import type { Source } from "../source";

export type ConnectionStatus = {
    state: BrokerState;
    /** Short address for the status line. */
    address?: string;
    error?: string;
    /** Topics with a known value (the browser's size). */
    topics?: number;
};

/** The Home Assistant connection, for its card. */
export type HaStatus = {
    state: HaState;
    /** Short address for the status line. */
    address?: string;
    error?: string;
    version?: string;
    entities?: number;
};

export type TopicHit = { topic: string; value: string; retained: boolean };

export type TopicInfo = {
    topic: string;
    /** The topic's last payload, if any arrived. */
    payload?: string;
    /** Leaf fields when the payload is JSON. */
    fields: { path: string; value: string }[];
    suggestion?: TopicSuggestion;
};

/** One level of the topic tree. */
export type TreeNode = {
    /** The last segment ("Wohnzimmer Lampe"). */
    name: string;
    /** The full topic up to this node. */
    topic: string;
    /** Topics below this node. */
    count: number;
    /** The node's own value, when the node is a topic itself. */
    value?: string;
};

/** A topic that changed while listening. */
export type Heard = {
    topic: string;
    value: string;
    /** Messages during listening. */
    count: number;
    /** It also changed shortly before listening started (a sensor that reports all the time). */
    busy: boolean;
};

export type TestResult = {
    sent?: { topic: string; payload: string };
    /** "confirmed": the state topic reported the new state; "no-answer"; "no-topic"; "offline". */
    outcome: "confirmed" | "no-answer" | "no-topic" | "offline";
    /** What the state topic said last. */
    reported?: string;
    ms?: number;
};

/** An entity in the device picker: from Home Assistant, or announced through MQTT discovery. */
export type DeviceItem = {
    /** The HA entity id ("light.desk"), or the MQTT discovery entity's unique id. */
    id: string;
    source: Source;
    name: string;
    /** The heading it is listed under: the HA area, or the MQTT device ("" for none). */
    group: string;
    /** Second line: the HA device and entity id, or the MQTT component. */
    sub: string;
    /** A config/diagnostic entity (listed after the main ones). */
    extra: boolean;
    /** MDI path of its icon. */
    icon?: string;
    /** Lower-case text the search looks in. */
    search: string;
};

/** PI → plugin */
export type PiRequest =
    | { event: "reconnect" }
    | { event: "ha-reconnect" }
    | { event: "proxy-password"; value: string }
    | { event: "window-opened"; width: number; height: number; scale: number }
    | { event: "ha-find"; requestId: number }
    | { event: "ha-attributes"; requestId: number; entityId: string }
    | { event: "ha-entity-list"; requestId: number }
    | { event: "topics"; requestId: number; query: string }
    | { event: "topic-info"; requestId: number; topic: string }
    | { event: "topic-tree"; requestId: number; prefix: string }
    | { event: "listen"; requestId: number; ms: number }
    | { event: "test-switch"; requestId: number; settings: SwitchTopics }
    | { event: "devices"; requestId: number; action: string; query: string; current?: { source: Source; id: string } }
    | { event: "device-apply"; requestId: number; action: string; source: Source; id: string };

/** Plugin → PI */
export type PiPush =
    | { event: "status"; status: ConnectionStatus }
    | { event: "ha-status"; status: HaStatus }
    /** Whether a proxy password is stored, and whether it is encrypted. */
    | { event: "proxy-password-state"; set: boolean; encrypted: boolean }
    | { event: "ha-find-result"; requestId: number; found: FoundHa[] }
    | { event: "ha-attributes-result"; requestId: number; state?: string; attributes: { name: string; value: string }[] }
    | { event: "ha-entity-list-result"; requestId: number; entities: { id: string; name: string }[] }
    | { event: "topics-result"; requestId: number; hits: TopicHit[]; total: number }
    | { event: "topic-info-result"; requestId: number; info: TopicInfo }
    | { event: "topic-tree-result"; requestId: number; prefix: string; nodes: TreeNode[] }
    | { event: "listen-result"; requestId: number; heard: Heard[] }
    | { event: "test-result"; requestId: number; result: TestResult }
    | { event: "devices-result"; requestId: number; items: DeviceItem[]; total: number; matching: number; current?: DeviceItem; sources: { ha: boolean; mqtt: boolean } }
    | { event: "device-apply-result"; requestId: number; settings?: Record<string, unknown> };
