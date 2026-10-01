// <mqc-device action="switch">
// Pick a Home Assistant device instead of topics: a search over the entities announced through
// MQTT discovery that fit this action, grouped by device. Picking one fills in all topics, values
// and the name (the plugin builds the settings). Hidden when the broker has no discovery configs.
import { escapeHtml, nextRequestId, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { HaItem, PiPush } from "../pi/protocol";

export class MqcDevice extends HTMLElement {
    private items: HaItem[] = [];
    private current: HaItem | undefined;
    private total = -1;
    private matching = 0;
    private open = false;
    private listId = 0;
    private applyId = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private offs: (() => void)[] = [];
    private readonly onDocClick = (e: MouseEvent) => {
        if (this.open && !e.composedPath().includes(this)) {
            this.open = false;
            this.render();
        }
    };

    private get action(): string {
        return this.getAttribute("action") ?? "switch";
    }

    connectedCallback(): void {
        this.classList.add("mqc-device");
        this.hidden = true;
        this.innerHTML = `
            <div class="pi-section-title">${escapeHtml(t("pi.ha_device"))}</div>
            <div class="pi-card"><div class="pi-padded">
                <div class="mqc-device-current"></div>
                <input class="pi-input mqc-device-search" type="search" spellcheck="false" placeholder="${escapeHtml(t("pi.ha_search"))}"/>
                <div class="mqc-device-list" hidden></div>
                <span class="pi-hint">${escapeHtml(t("pi.ha_hint"))}</span>
            </div></div>`;
        const input = this.querySelector<HTMLInputElement>("input")!;
        input.addEventListener("focus", () => this.search(input.value));
        input.addEventListener("input", () => {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.search(input.value), 200);
        });
        input.addEventListener("keydown", (e) => e.key === "Escape" && ((this.open = false), this.render()));
        document.addEventListener("click", this.onDocClick);
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event === "ha-entities-result" && msg.requestId === this.listId) {
                    this.items = msg.items;
                    this.total = msg.total;
                    this.matching = msg.matching;
                    this.current = msg.current;
                    this.render();
                } else if (msg?.event === "ha-apply-result" && msg.requestId === this.applyId && msg.settings) {
                    sd.setSettings(msg.settings as Record<string, never>);
                } else if (msg?.event === "status" && msg.status.state === "online") {
                    this.search("", false);
                }
            }),
            sd.onSettings(() => this.render()),
        );
        this.search("", false);
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
        document.removeEventListener("click", this.onDocClick);
    }

    private search(query: string, open = true): void {
        this.open = open;
        this.listId = nextRequestId();
        sd.sendToPlugin({ event: "ha-entities", requestId: this.listId, action: this.action, query: query.trim(), current: String(sd.settings.haEntity ?? "") });
        this.render();
    }

    private pick(item: HaItem): void {
        this.open = false;
        this.current = item;
        this.applyId = nextRequestId();
        sd.sendToPlugin({ event: "ha-apply", requestId: this.applyId, action: this.action, id: item.id });
        const input = this.querySelector<HTMLInputElement>("input")!;
        input.value = "";
        input.blur();
        this.render();
    }

    private render(): void {
        // No discovery on this broker: the picker isn't shown at all
        this.hidden = this.total <= 0;
        if (this.hidden) return;
        const cur = sd.settings.haEntity && this.current?.id === sd.settings.haEntity ? this.current : undefined;
        this.querySelector<HTMLElement>(".mqc-device-current")!.innerHTML = cur
            ? `<div class="mqc-device-chosen">${svg(cur.icon)}<span class="pi-select-text"><span class="pi-strong">${escapeHtml(cur.name)}</span><span class="pi-option-sub">${escapeHtml([cur.device !== cur.name ? cur.device : "", cur.component].filter(Boolean).join(" · "))}</span></span></div>`
            : "";
        const list = this.querySelector<HTMLElement>(".mqc-device-list")!;
        list.hidden = !this.open;
        if (!this.open) return;
        if (!this.items.length) {
            list.innerHTML = `<div class="pi-hint pi-select-note">${escapeHtml(t("pi.ha_none"))}</div>`;
            return;
        }
        let lastDevice: string | undefined;
        const rows: string[] = [];
        this.items.forEach((it, n) => {
            const device = it.device ?? "";
            if (device !== lastDevice) {
                rows.push(`<div class="pi-select-group">${escapeHtml(device || t("pi.ha_no_device"))}</div>`);
                lastDevice = device;
            }
            rows.push(
                `<button type="button" class="pi-option mqc-device-item${it.extra ? " mqc-busy" : ""}" data-n="${n}">${svg(it.icon)}<span class="pi-select-text"><span class="pi-label">${escapeHtml(it.name)}</span><span class="pi-option-sub">${escapeHtml(it.component)}</span></span></button>`,
            );
        });
        if (this.matching > this.items.length) rows.push(`<div class="pi-hint pi-select-note">${escapeHtml(t("pi.topics_more", { n: this.matching - this.items.length }))}</div>`);
        list.innerHTML = rows.join("");
        // mousedown: picking must not lose against the input's blur
        list.querySelectorAll<HTMLElement>(".mqc-device-item").forEach((el) =>
            el.addEventListener("mousedown", (e) => {
                e.preventDefault();
                this.pick(this.items[Number(el.dataset.n)]);
            }),
        );
    }
}

function svg(path: string | undefined): string {
    return `<span class="mqc-device-icon">${path ? `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="${escapeHtml(path)}"/></svg>` : ""}</span>`;
}
