// <hac-json-field setting="field" topic-setting="stateTopic" label="…">
// Pick a field of a JSON payload by clicking it: lists the fields of the topic's current payload
// with their values ("state ON", "color.x 0.31"); the path can also be typed. Hidden for plain
// text payloads unless a field is already set.
import { escapeHtml, nextRequestId, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { PiPush, TopicInfo } from "../pi/protocol";

export class HacJsonField extends HTMLElement {
    private info: TopicInfo | undefined;
    private requestId = 0;
    private infoFor: string | undefined;
    private offs: (() => void)[] = [];

    private get key(): string {
        return this.getAttribute("setting") ?? "field";
    }

    private get topic(): string {
        return String(sd.settings[this.getAttribute("topic-setting") ?? "stateTopic"] ?? "").trim();
    }

    connectedCallback(): void {
        const label = this.getAttribute("label");
        this.classList.add("pi-field", "hac-json-field");
        this.innerHTML = `
            <label>
                ${label ? `<span class="pi-field-label">${escapeHtml(t(label))}</span>` : ""}
                <span class="pi-input-row"><input class="pi-input" type="text" spellcheck="false" autocomplete="off" placeholder="${escapeHtml(t("pi.field_placeholder"))}"/></span>
            </label>
            <div class="hac-fields"></div>`;
        const input = this.querySelector<HTMLInputElement>("input")!;
        input.addEventListener("change", () => this.set(input.value.trim()));
        input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event === "topic-info-result" && msg.requestId === this.requestId) {
                    this.info = msg.info;
                    this.render();
                } else if (msg?.event === "status" && msg.status.state === "online") {
                    this.infoFor = undefined;
                    this.request();
                }
            }),
            sd.onSettings(() => {
                this.request();
                this.render();
            }),
        );
        this.request();
        this.render();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    private set(path: string): void {
        if (path !== String(sd.settings[this.key] ?? "")) sd.setSetting(this.key, path);
    }

    private request(): void {
        const topic = this.topic;
        if (topic === this.infoFor) return;
        this.infoFor = topic;
        this.info = undefined;
        if (!topic) return;
        this.requestId = nextRequestId();
        sd.sendToPlugin({ event: "topic-info", requestId: this.requestId, topic });
    }

    private render(): void {
        const current = String(sd.settings[this.key] ?? "");
        const input = this.querySelector<HTMLInputElement>("input")!;
        if (document.activeElement !== input) input.value = current;
        const fields = this.info?.topic === this.topic ? this.info.fields : [];
        // Plain text needs no field: hide unless one is set (e.g. by a suggestion)
        this.hidden = !fields.length && !current;
        const list = this.querySelector<HTMLElement>(".hac-fields")!;
        list.innerHTML = fields
            .map(
                (f, n) =>
                    `<button type="button" class="hac-field-row" data-n="${n}" aria-pressed="${f.path === current}"><span class="hac-mono">${escapeHtml(f.path)}</span><span class="pi-hint">${escapeHtml(f.value.length > 40 ? `${f.value.slice(0, 39)}…` : f.value)}</span></button>`,
            )
            .join("");
        list.querySelectorAll<HTMLElement>(".hac-field-row").forEach((el) => el.addEventListener("click", () => this.set(fields[Number(el.dataset.n)].path)));
    }
}
