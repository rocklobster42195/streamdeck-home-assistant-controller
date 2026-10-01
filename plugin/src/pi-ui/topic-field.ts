// <mqc-topic setting="stateTopic" label="…" [placeholder="…"] [hint="…"] [suggest]>
// A topic field with a live search over every topic on the broker (with its current value), and
// below it the topic's current payload. With `suggest`, a recognised scheme (zigbee2mqtt, Tasmota,
// Shelly, ESPHome, …) is offered as a card that fills the command topic, field, values and
// availability in one click.
import { escapeHtml, nextRequestId, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { TopicSuggestion } from "../mqtt/schemes";
import type { PiPush, TopicHit, TopicInfo } from "../pi/protocol";

/** Settings a suggestion fills; missing ones are cleared so nothing stale stays. */
const SUGGESTED_KEYS = ["commandTopic", "field", "onValue", "offValue", "commandOn", "commandOff", "template", "availabilityTopic"] as const;

export class MqcTopic extends HTMLElement {
    private hits: TopicHit[] = [];
    private total = 0;
    private open = false;
    private info: TopicInfo | undefined;
    private searchId = 0;
    private infoId = 0;
    private infoFor: string | undefined;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private offs: (() => void)[] = [];
    private readonly onDocClick = (e: MouseEvent) => {
        if (this.open && !e.composedPath().includes(this)) this.setOpen(false);
    };

    private get key(): string {
        return this.getAttribute("setting") ?? "stateTopic";
    }

    private get value(): string {
        return String(sd.settings[this.key] ?? "").trim();
    }

    connectedCallback(): void {
        const label = this.getAttribute("label");
        const hint = this.getAttribute("hint");
        const placeholder = this.getAttribute("placeholder");
        this.classList.add("pi-field", "mqc-topic");
        this.innerHTML = `
            <label>
                ${label ? `<span class="pi-field-label">${escapeHtml(t(label))}</span>` : ""}
                <span class="pi-input-row"><input class="pi-input mqc-topic-input" type="text" spellcheck="false" autocomplete="off" ${placeholder ? `placeholder="${escapeHtml(t(placeholder))}"` : ""}/></span>
            </label>
            <div class="mqc-hits" role="listbox" hidden></div>
            <span class="pi-hint mqc-topic-value"></span>
            ${hint ? `<span class="pi-hint">${escapeHtml(t(hint))}</span>` : ""}
            <div class="mqc-suggestion" hidden></div>`;
        const input = this.querySelector<HTMLInputElement>("input")!;
        input.addEventListener("input", () => {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => this.search(input.value), 200);
        });
        input.addEventListener("focus", () => this.search(input.value));
        input.addEventListener("change", () => this.choose(input.value.trim()));
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") input.blur();
            if (e.key === "Escape") this.setOpen(false);
        });
        document.addEventListener("click", this.onDocClick);
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event === "topics-result" && msg.requestId === this.searchId) {
                    this.hits = msg.hits;
                    this.total = msg.total;
                    this.renderHits();
                } else if (msg?.event === "topic-info-result" && msg.requestId === this.infoId) {
                    this.info = msg.info;
                    this.renderInfo();
                } else if (msg?.event === "status" && msg.status.state === "online") {
                    // Values arrive after connecting: ask again
                    this.infoFor = undefined;
                    this.requestInfo();
                }
            }),
            sd.onSettings(() => {
                if (document.activeElement !== input) input.value = this.value;
                this.requestInfo();
                this.renderInfo();
            }),
        );
        input.value = this.value;
        this.requestInfo();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
        document.removeEventListener("click", this.onDocClick);
    }

    private search(query: string): void {
        this.searchId = nextRequestId();
        sd.sendToPlugin({ event: "topics", requestId: this.searchId, query: query.trim() });
        this.setOpen(true);
    }

    private choose(topic: string): void {
        this.setOpen(false);
        this.querySelector<HTMLInputElement>("input")!.value = topic;
        if (topic !== this.value) sd.setSetting(this.key, topic);
    }

    private requestInfo(): void {
        const topic = this.value;
        if (topic === this.infoFor) return;
        this.infoFor = topic;
        this.info = undefined;
        if (!topic) return this.renderInfo();
        this.infoId = nextRequestId();
        sd.sendToPlugin({ event: "topic-info", requestId: this.infoId, topic });
    }

    private setOpen(open: boolean): void {
        this.open = open;
        this.renderHits();
    }

    private renderHits(): void {
        const list = this.querySelector<HTMLElement>(".mqc-hits")!;
        list.hidden = !this.open || !this.hits.length;
        if (list.hidden) return;
        const more = this.total > this.hits.length ? `<div class="pi-hint pi-select-note">${escapeHtml(t("pi.topics_more", { n: this.total - this.hits.length }))}</div>` : "";
        list.innerHTML =
            this.hits
                .map(
                    (h, n) =>
                        `<button type="button" class="pi-option mqc-hit" data-n="${n}"><span class="pi-select-text"><span class="pi-label">${escapeHtml(h.topic)}</span><span class="pi-option-sub">${escapeHtml(h.value || "—")}</span></span></button>`,
                )
                .join("") + more;
        list.querySelectorAll<HTMLElement>(".mqc-hit").forEach((el) => el.addEventListener("click", () => this.choose(this.hits[Number(el.dataset.n)].topic)));
    }

    private renderInfo(): void {
        const value = this.querySelector<HTMLElement>(".mqc-topic-value")!;
        const info = this.info?.topic === this.value ? this.info : undefined;
        value.textContent = !this.value ? "" : info?.payload !== undefined ? t("pi.current_value", { value: short(info.payload) }) : info ? t("pi.no_value_yet") : "";
        const card = this.querySelector<HTMLElement>(".mqc-suggestion")!;
        const s = this.hasAttribute("suggest") ? info?.suggestion : undefined;
        card.hidden = !s;
        if (!s) return;
        const applied = SUGGESTED_KEYS.every((k) => String(sd.settings[k] ?? "") === String(s[k] ?? ""));
        const rows: [string, string | undefined][] = [
            ["pi.command_topic", s.commandTopic],
            ["pi.field", s.field],
            ["pi.on_off", s.onValue && s.offValue ? `${s.onValue} / ${s.offValue}` : undefined],
            ["pi.availability_topic", s.availabilityTopic],
        ];
        card.innerHTML = `
            <div class="mqc-suggestion-head">
                <span class="mqc-badge">${escapeHtml(t(`pi.scheme_${s.scheme}`))}</span>
                <span class="pi-hint">${escapeHtml(t(applied ? "pi.scheme_applied" : "pi.scheme_found"))}</span>
            </div>
            ${applied ? "" : `<div class="mqc-suggestion-rows">${rows
                .filter(([, v]) => v)
                .map(([k, v]) => `<span class="pi-hint">${escapeHtml(t(k))}</span><span class="mqc-mono">${escapeHtml(v!)}</span>`)
                .join("")}</div>
            <button type="button" class="pi-button pi-button-small mqc-apply">${escapeHtml(t("pi.scheme_apply"))}</button>`}`;
        card.querySelector(".mqc-apply")?.addEventListener("click", () => apply(s));
    }
}

function apply(s: TopicSuggestion): void {
    const patch: Record<string, string> = {};
    for (const k of SUGGESTED_KEYS) patch[k] = s[k] ?? "";
    sd.setSettings(patch);
}

function short(payload: string): string {
    const p = payload.replace(/\s+/g, " ").trim();
    return p.length > 120 ? `${p.slice(0, 119)}…` : p || "''";
}
