// <hac-device action="switch">
// Pick what the key shows and switches: a search over the Home Assistant entities (by area) and
// the entities announced through MQTT discovery (by device) that fit this action, each with a
// source badge, plus "MQTT topic by hand". Picking one sets the key's source and fills in its
// settings (the plugin builds them). Hidden while neither source has anything to offer.
import { escapeHtml, nextRequestId, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { DeviceItem, PiPush } from "../pi/protocol";
import { sourceOf } from "../source";

const filled = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";
/** Actions that can show HA entities yet; the others stay with MQTT. */
const HA_ACTIONS = new Set(["switch", "value", "publish", "multi-state", "slider"]);

export class HacDevice extends HTMLElement {
    private items: DeviceItem[] = [];
    private current: DeviceItem | undefined;
    private total = -1;
    private matching = 0;
    private sources = { ha: false, mqtt: false };
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
        this.classList.add("hac-device");
        this.hidden = true;
        this.innerHTML = `
            <div class="pi-section-title">${escapeHtml(t("pi.pick_device"))}</div>
            <div class="pi-card"><div class="pi-padded">
                <div class="hac-device-current"></div>
                <input class="pi-input hac-device-search" type="search" spellcheck="false" placeholder="${escapeHtml(t("pi.device_search"))}"/>
                <div class="hac-device-list" hidden></div>
                <span class="pi-hint">${escapeHtml(t("pi.device_hint"))}</span>
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
                if (msg?.event === "devices-result" && msg.requestId === this.listId) {
                    this.items = msg.items;
                    this.total = msg.total;
                    this.matching = msg.matching;
                    this.current = msg.current;
                    this.sources = msg.sources;
                    this.render();
                } else if (msg?.event === "device-apply-result" && msg.requestId === this.applyId && msg.settings) {
                    sd.setSettings(msg.settings as Record<string, never>);
                } else if ((msg?.event === "status" || msg?.event === "ha-status") && msg.status.state === "online") {
                    this.search("", false);
                }
            }),
            sd.onSettings(() => this.render()),
            sd.onGlobalSettings(() => this.startWithHa()),
        );
        this.startWithHa();
        this.search("", false);
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
        document.removeEventListener("click", this.onDocClick);
    }

    private haSetUp(): boolean {
        if (!HA_ACTIONS.has(this.action)) return false;
        const g = sd.globalSettings as Record<string, unknown>;
        return filled(g.haUrl) || filled(g.haToken);
    }

    /** A new key (no source, no topics) starts with Home Assistant when HA is set up. */
    private startWithHa(): void {
        const s = sd.settings as Record<string, unknown>;
        if (s.source || !this.haSetUp() || sourceOf(s, true) !== "ha") return;
        sd.setSettings({ source: "ha" });
    }

    private currentRef(): { source: "ha" | "mqtt"; id: string } {
        const s = sd.settings as Record<string, unknown>;
        const source = sourceOf(s, this.haSetUp());
        return { source, id: String((source === "ha" ? s.entityId : s.haEntity) ?? "") };
    }

    private search(query: string, open = true): void {
        this.open = open;
        this.listId = nextRequestId();
        sd.sendToPlugin({ event: "devices", requestId: this.listId, action: this.action, query: query.trim(), current: this.currentRef() });
        this.render();
    }

    private pick(item: DeviceItem): void {
        this.current = item;
        this.applyId = nextRequestId();
        sd.sendToPlugin({ event: "device-apply", requestId: this.applyId, action: this.action, source: item.source, id: item.id });
        this.close();
    }

    /** MQTT topics typed in by hand: the topic fields below take over. */
    private byHand(): void {
        this.current = undefined;
        sd.setSettings({ source: "mqtt", entityId: "", haEntity: "" });
        this.close();
    }

    private close(): void {
        this.open = false;
        const input = this.querySelector<HTMLInputElement>("input")!;
        input.value = "";
        input.blur();
        this.render();
    }

    private render(): void {
        // Nothing to pick from (no HA, no discovery on the broker): the topic fields are enough
        this.hidden = this.total <= 0 && !this.sources.ha;
        if (this.hidden) return;
        const ref = this.currentRef();
        const cur = ref.id && this.current?.id === ref.id && this.current.source === ref.source ? this.current : undefined;
        this.querySelector<HTMLElement>(".hac-device-current")!.innerHTML = cur
            ? `<div class="hac-device-chosen">${svg(cur.icon)}<span class="pi-select-text"><span class="pi-strong">${escapeHtml(cur.name)}</span><span class="pi-option-sub">${escapeHtml(cur.sub)}</span></span>${badge(cur.source)}</div>`
            : ref.source === "mqtt" && !ref.id && this.sources.mqtt
              ? `<div class="hac-device-chosen"><span class="pi-select-text"><span class="pi-strong">${escapeHtml(t("pi.by_hand"))}</span></span>${badge("mqtt")}</div>`
              : "";
        const list = this.querySelector<HTMLElement>(".hac-device-list")!;
        list.hidden = !this.open;
        if (!this.open) return;
        const rows: string[] = [];
        if (!this.items.length) rows.push(`<div class="pi-hint pi-select-note">${escapeHtml(t("pi.device_none"))}</div>`);
        let lastGroup: string | undefined;
        this.items.forEach((it, n) => {
            const group = `${it.source}:${it.group}`;
            if (group !== lastGroup) {
                rows.push(`<div class="pi-select-group">${escapeHtml(it.group || t(it.source === "ha" ? "pi.no_area" : "pi.no_device"))}${badge(it.source)}</div>`);
                lastGroup = group;
            }
            rows.push(
                `<button type="button" class="pi-option hac-device-item${it.extra ? " hac-busy" : ""}" data-n="${n}">${svg(it.icon)}<span class="pi-select-text"><span class="pi-label">${escapeHtml(it.name)}</span><span class="pi-option-sub">${escapeHtml(it.sub)}</span></span></button>`,
            );
        });
        if (this.matching > this.items.length) rows.push(`<div class="pi-hint pi-select-note">${escapeHtml(t("pi.topics_more", { n: this.matching - this.items.length }))}</div>`);
        if (this.sources.mqtt) rows.push(`<button type="button" class="pi-option hac-device-hand"><span class="pi-select-text"><span class="pi-label">${escapeHtml(t("pi.by_hand"))}</span><span class="pi-option-sub">${escapeHtml(t("pi.by_hand_sub"))}</span></span>${badge("mqtt")}</button>`);
        list.innerHTML = rows.join("");
        // mousedown: picking must not lose against the input's blur
        list.querySelectorAll<HTMLElement>(".hac-device-item").forEach((el) =>
            el.addEventListener("mousedown", (e) => {
                e.preventDefault();
                this.pick(this.items[Number(el.dataset.n)]);
            }),
        );
        list.querySelector<HTMLElement>(".hac-device-hand")?.addEventListener("mousedown", (e) => {
            e.preventDefault();
            this.byHand();
        });
    }
}

function badge(source: "ha" | "mqtt"): string {
    return `<span class="hac-badge hac-badge-${source}">${source === "ha" ? "HA" : "MQTT"}</span>`;
}

function svg(path: string | undefined): string {
    return `<span class="hac-device-icon">${path ? `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="${escapeHtml(path)}"/></svg>` : ""}</span>`;
}
