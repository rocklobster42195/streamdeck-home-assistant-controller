// The topic field's two helpers below the input: "Browse" (the broker's topics as a tree, one
// level at a time, with values) and "Listen" (operate the device for 10 s, then pick from the
// topics that changed; topics that report all the time come last, greyed out).
import { escapeHtml, nextRequestId, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { Heard, PiPush, TreeNode } from "../pi/protocol";

const LISTEN_MS = 10_000;

type Mode = { kind: "closed" } | { kind: "tree"; prefix: string; nodes?: TreeNode[] } | { kind: "listening"; until: number } | { kind: "heard"; heard: Heard[] };

export class TopicExplorer {
    private mode: Mode = { kind: "closed" };
    private requestId = 0;
    private ticker: ReturnType<typeof setInterval> | undefined;
    private readonly off: () => void;

    constructor(
        private readonly root: HTMLElement,
        private readonly choose: (topic: string) => void,
    ) {
        root.classList.add("mqc-explore");
        this.off = sd.onMessage((msg: PiPush) => {
            if (msg?.event === "topic-tree-result" && msg.requestId === this.requestId && this.mode.kind === "tree") {
                this.mode = { kind: "tree", prefix: msg.prefix, nodes: msg.nodes };
                this.render();
            } else if (msg?.event === "listen-result" && msg.requestId === this.requestId) {
                clearInterval(this.ticker);
                this.mode = { kind: "heard", heard: msg.heard };
                this.render();
            }
        });
        this.render();
    }

    destroy(): void {
        this.off();
        clearInterval(this.ticker);
    }

    private open(prefix: string): void {
        this.mode = { kind: "tree", prefix };
        this.requestId = nextRequestId();
        sd.sendToPlugin({ event: "topic-tree", requestId: this.requestId, prefix });
        this.render();
    }

    private listen(): void {
        this.mode = { kind: "listening", until: Date.now() + LISTEN_MS };
        this.requestId = nextRequestId();
        sd.sendToPlugin({ event: "listen", requestId: this.requestId, ms: LISTEN_MS });
        clearInterval(this.ticker);
        this.ticker = setInterval(() => this.render(), 500);
        this.render();
    }

    private close(): void {
        clearInterval(this.ticker);
        this.mode = { kind: "closed" };
        this.render();
    }

    private render(): void {
        const m = this.mode;
        const buttons = `<div class="mqc-explore-buttons">
            <button type="button" class="pi-button pi-button-small" data-act="browse" aria-pressed="${m.kind === "tree"}">${escapeHtml(t("pi.browse"))}</button>
            <button type="button" class="pi-button pi-button-small" data-act="listen" ${m.kind === "listening" ? "disabled" : ""}>${escapeHtml(t("pi.listen"))}</button>
            ${m.kind === "closed" ? "" : `<button type="button" class="pi-button pi-button-small" data-act="close">${escapeHtml(t("pi.done"))}</button>`}
        </div>`;
        this.root.innerHTML = buttons + this.body();
        this.root.querySelector('[data-act="browse"]')!.addEventListener("click", () => (m.kind === "tree" ? this.close() : this.open("")));
        this.root.querySelector('[data-act="listen"]')!.addEventListener("click", () => this.listen());
        this.root.querySelector('[data-act="close"]')?.addEventListener("click", () => this.close());
        this.root.querySelectorAll<HTMLElement>("[data-prefix]").forEach((el) => el.addEventListener("click", () => this.open(el.dataset.prefix!)));
        this.root.querySelectorAll<HTMLElement>("[data-topic]").forEach((el) =>
            el.addEventListener("click", () => {
                this.choose(el.dataset.topic!);
                this.close();
            }),
        );
    }

    private body(): string {
        const m = this.mode;
        if (m.kind === "tree") {
            const crumbs = m.prefix ? m.prefix.split("/") : [];
            const path = [`<button type="button" class="mqc-crumb" data-prefix="">${escapeHtml(t("pi.all_topics"))}</button>`, ...crumbs.map((c, i) => `<button type="button" class="mqc-crumb" data-prefix="${escapeHtml(crumbs.slice(0, i + 1).join("/"))}">${escapeHtml(c)}</button>`)].join("<span>/</span>");
            const rows = !m.nodes
                ? `<div class="pi-hint pi-select-note">${escapeHtml(t("kit.loading"))}</div>`
                : !m.nodes.length
                  ? `<div class="pi-hint pi-select-note">${escapeHtml(t("pi.no_topics"))}</div>`
                  : m.nodes.map((n) => row(n)).join("");
            return `<div class="mqc-tree"><div class="mqc-crumbs">${path}</div><div class="mqc-tree-list">${rows}</div></div>`;
        }
        if (m.kind === "listening") {
            const left = Math.max(0, Math.ceil((m.until - Date.now()) / 1000));
            return `<div class="mqc-listen pi-hint"><span class="pi-dot pi-dot-lg" data-status="warn"></span>${escapeHtml(t("pi.listening", { n: left }))}</div>`;
        }
        if (m.kind === "heard") {
            if (!m.heard.length) return `<div class="mqc-listen pi-hint">${escapeHtml(t("pi.heard_nothing"))}</div>`;
            return `<div class="mqc-tree"><div class="pi-hint mqc-heard-head">${escapeHtml(t("pi.heard"))}</div><div class="mqc-tree-list">${m.heard
                .map(
                    (h) =>
                        `<button type="button" class="pi-option mqc-hit${h.busy ? " mqc-busy" : ""}" data-topic="${escapeHtml(h.topic)}"><span class="pi-select-text"><span class="pi-label">${escapeHtml(h.topic)}</span><span class="pi-option-sub">${escapeHtml(h.value)}${h.busy ? ` · ${escapeHtml(t("pi.busy"))}` : ""}</span></span></button>`,
                )
                .join("")}</div></div>`;
        }
        return "";
    }
}

/** A tree row: a folder opens the next level; a topic is picked; a topic with sub-topics offers both. */
function row(n: TreeNode): string {
    const value = n.value !== undefined ? `<span class="pi-option-sub">${escapeHtml(n.value || "''")}</span>` : "";
    const pick = n.value !== undefined ? `<button type="button" class="pi-button pi-button-small mqc-pick" data-topic="${escapeHtml(n.topic)}">${escapeHtml(t("pi.pick"))}</button>` : "";
    if (n.count > 0)
        return `<div class="mqc-tree-row"><button type="button" class="pi-option" data-prefix="${escapeHtml(n.topic)}"><span class="pi-select-text"><span class="pi-label">▸ ${escapeHtml(n.name)} <span class="pi-hint">(${n.count})</span></span>${value}</span></button>${pick}</div>`;
    return `<div class="mqc-tree-row"><button type="button" class="pi-option" data-topic="${escapeHtml(n.topic)}"><span class="pi-select-text"><span class="pi-label">${escapeHtml(n.name)}</span>${value}</span></button></div>`;
}
