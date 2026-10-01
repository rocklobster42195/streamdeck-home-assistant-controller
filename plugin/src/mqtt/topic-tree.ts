// The topic tree and "Listen" without Stream Deck: one level of the tree below a prefix, and which
// topics changed while the user operated a device (separating those that report all the time).
import type { Heard, TreeNode } from "../pi/protocol";
import type { Message } from "./broker";

/** The children of `prefix` ("" for the roots), folders first, then by name. */
export function treeLevel(topics: Iterable<[string, Message]>, prefix: string, preview: (p: string) => string): TreeNode[] {
    const base = prefix ? `${prefix}/` : "";
    const nodes = new Map<string, TreeNode>();
    for (const [topic, msg] of topics) {
        if (base && !topic.startsWith(base)) continue;
        const rest = topic.slice(base.length);
        if (!rest) continue;
        const slash = rest.indexOf("/");
        const name = slash < 0 ? rest : rest.slice(0, slash);
        const full = base + name;
        let node = nodes.get(name);
        if (!node) nodes.set(name, (node = { name, topic: full, count: 0 }));
        if (slash < 0) node.value = preview(msg.payload);
        else node.count++;
    }
    return [...nodes.values()].sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/**
 * Records messages between start() and stop(). A topic counts as "busy" when it also changed in
 * the minute before listening started, so the device the user just operated stands out.
 */
export class Listener {
    private readonly before = new Map<string, number>();
    private readonly heard = new Map<string, { value: string; count: number }>();
    private startedAt = 0;

    constructor(private readonly busyWindowMs = 60_000) {}

    start(topics: Iterable<[string, Message]>, now = Date.now()): void {
        this.startedAt = now;
        // Only live (not retained) messages count as changes
        for (const [topic, msg] of topics) if (!msg.retained) this.before.set(topic, msg.at);
    }

    /** Feed every message that arrives while listening. */
    add(topic: string, msg: Message): void {
        if (msg.at < this.startedAt || msg.retained) return;
        const h = this.heard.get(topic);
        if (h) {
            h.count++;
            h.value = msg.payload;
        } else this.heard.set(topic, { value: msg.payload, count: 1 });
    }

    /** The changed topics, quiet ones first (they are most likely what the user operated). */
    result(preview: (p: string) => string): Heard[] {
        return [...this.heard]
            .map(([topic, h]) => ({ topic, value: preview(h.value), count: h.count, busy: (this.before.get(topic) ?? 0) > this.startedAt - this.busyWindowMs }))
            .sort((a, b) => Number(a.busy) - Number(b.busy) || a.count - b.count || a.topic.localeCompare(b.topic));
    }
}
