// <mqc-test [prefix="press"]>
// "Test: switch once": sends the command for the other state with the key's current settings and
// shows whether the state topic confirmed it within 3 s, or what was sent and what to check.
// It publishes to the real broker, so it only runs on the user's click.
import { escapeHtml, nextRequestId, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { SwitchTopics } from "../mqtt/switch-state";
import type { PiPush, TestResult } from "../pi/protocol";

const KEYS = ["stateTopic", "commandTopic", "field", "onValue", "offValue", "commandOn", "commandOff", "template"] as const;

export class MqcTest extends HTMLElement {
    private requestId = 0;
    private running = false;
    private result: TestResult | undefined;
    private off?: () => void;

    connectedCallback(): void {
        this.classList.add("mqc-test");
        this.off = sd.onMessage((msg: PiPush) => {
            if (msg?.event !== "test-result" || msg.requestId !== this.requestId) return;
            this.running = false;
            this.result = msg.result;
            this.render();
        });
        this.render();
    }

    disconnectedCallback(): void {
        this.off?.();
    }

    /** The switch settings, read from prefixed keys for press actions ("pressStateTopic", …). */
    private settings(): SwitchTopics {
        const prefix = this.getAttribute("prefix") ?? "";
        const out: Record<string, string> = {};
        for (const k of KEYS) {
            const key = prefix ? `${prefix}${k[0].toUpperCase()}${k.slice(1)}` : k;
            const v = sd.settings[key];
            if (typeof v === "string" && v) out[k] = v;
        }
        return out as SwitchTopics;
    }

    private run(): void {
        (document.activeElement as HTMLElement | null)?.blur();
        this.running = true;
        this.result = undefined;
        this.requestId = nextRequestId();
        // Let a field that still had focus save first
        setTimeout(() => sd.sendToPlugin({ event: "test-switch", requestId: this.requestId, settings: this.settings() }), 60);
        this.render();
    }

    private render(): void {
        const r = this.result;
        let line = "";
        if (this.running) line = `<span class="pi-dot" data-status="warn"></span>${escapeHtml(t("pi.test_running"))}`;
        else if (r?.outcome === "confirmed") line = `<span class="pi-dot" data-status="ok"></span>${escapeHtml(t("pi.test_confirmed", { ms: r.ms ?? 0 }))}`;
        else if (r?.outcome === "no-answer")
            line = `<span class="pi-dot" data-status="error"></span><span>${escapeHtml(t("pi.test_no_answer"))}<br><span class="mqc-mono">${escapeHtml(`${r.sent?.topic} ← ${r.sent?.payload}`)}</span>${r.reported !== undefined ? `<br>${escapeHtml(t("pi.test_reported", { value: r.reported || "''" }))}` : ""}</span>`;
        else if (r?.outcome === "no-topic") line = `<span class="pi-dot" data-status="error"></span>${escapeHtml(t("pi.test_no_topic"))}`;
        else if (r?.outcome === "offline") line = `<span class="pi-dot" data-status="error"></span>${escapeHtml(t("pi.test_offline"))}`;
        this.innerHTML = `
            <div class="pi-row"><div class="pi-row-text"><span class="pi-label">${escapeHtml(t("pi.test"))}</span><span class="pi-hint">${escapeHtml(t("pi.test_hint"))}</span></div>
            <button type="button" class="pi-button pi-button-small" ${this.running ? "disabled" : ""}>${escapeHtml(t("pi.test_button"))}</button></div>
            ${line ? `<div class="pi-hint mqc-test-result">${line}</div>` : ""}`;
        this.querySelector("button")!.addEventListener("click", () => this.run());
    }
}
