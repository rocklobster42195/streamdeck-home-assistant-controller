// MQC's messages between the plugin and its property inspectors (shared by both sides). The kit
// handles "pi-ready", "options" and "options-result" itself.
import type { BrokerState } from "../mqtt/broker";
import type { TopicSuggestion } from "../mqtt/schemes";

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

/** PI → plugin */
export type PiRequest =
    | { event: "reconnect" }
    | { event: "topics"; requestId: number; query: string }
    | { event: "topic-info"; requestId: number; topic: string };

/** Plugin → PI */
export type PiPush =
    | { event: "status"; status: ConnectionStatus }
    | { event: "topics-result"; requestId: number; hits: TopicHit[]; total: number }
    | { event: "topic-info-result"; requestId: number; info: TopicInfo };
