// HAC's messages between the plugin and its property inspectors (shared by both sides). The kit
// handles "pi-ready", "options" and "options-result" itself.
import type { BrokerState } from "../mqtt/broker";
import type { TopicSuggestion } from "../mqtt/schemes";
import type { SwitchTopics } from "../mqtt/switch-state";

export type ConnectionStatus = {
    state: BrokerState;
    /** Short address for the status line. */
    address?: string;
    error?: string;
    /** Topics with a known value (the browser's size). */
    topics?: number;
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

/** A Home Assistant entity in the device picker. */
export type HaItem = {
    id: string;
    name: string;
    device?: string;
    component: string;
    /** A config/diagnostic entity (listed after the main ones). */
    extra: boolean;
    /** MDI path of its icon. */
    icon?: string;
};

/** PI → plugin */
export type PiRequest =
    | { event: "reconnect" }
    | { event: "topics"; requestId: number; query: string }
    | { event: "topic-info"; requestId: number; topic: string }
    | { event: "topic-tree"; requestId: number; prefix: string }
    | { event: "listen"; requestId: number; ms: number }
    | { event: "test-switch"; requestId: number; settings: SwitchTopics }
    | { event: "ha-entities"; requestId: number; action: string; query: string; current?: string }
    | { event: "ha-apply"; requestId: number; action: string; id: string };

/** Plugin → PI */
export type PiPush =
    | { event: "status"; status: ConnectionStatus }
    | { event: "topics-result"; requestId: number; hits: TopicHit[]; total: number }
    | { event: "topic-info-result"; requestId: number; info: TopicInfo }
    | { event: "topic-tree-result"; requestId: number; prefix: string; nodes: TreeNode[] }
    | { event: "listen-result"; requestId: number; heard: Heard[] }
    | { event: "test-result"; requestId: number; result: TestResult }
    | { event: "ha-entities-result"; requestId: number; items: HaItem[]; total: number; matching: number; current?: HaItem }
    | { event: "ha-apply-result"; requestId: number; settings?: Record<string, unknown> };
