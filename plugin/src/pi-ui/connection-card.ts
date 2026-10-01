// <mqc-connection-card> — the broker connection, shared by all MQ-C actions (global settings):
// status line, address, login, "allow self-signed certificates", and a Connect button.
import { escapeHtml, reloadPiSelects, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { ConnectionStatus, PiPush } from "../pi/protocol";

const DOT: Record<ConnectionStatus["state"], string> = { online: "ok", connecting: "warn", offline: "error", denied: "error", invalid: "error", unconfigured: "" };

export class MqcConnectionCard extends HTMLElement {
    private status: ConnectionStatus | undefined;
    private expanded = false;
    private offs: (() => void)[] = [];

    connectedCallback(): void {
        this.innerHTML = `
            <div class="pi-section-title">${escapeHtml(t("pi.broker"))}</div>
            <div class="pi-card">
                <div class="pi-padded">
                    <div class="mqc-conn-head">
                        <span class="pi-dot pi-dot-lg"></span>
                        <div class="pi-select-text"><span class="pi-strong mqc-conn-title"></span><span class="pi-hint mqc-conn-sub"></span></div>
                        <button type="button" class="pi-button pi-button-small mqc-conn-toggle"></button>
                    </div>
                </div>
                <div class="mqc-conn-body">
                    <pi-field setting="brokerUrl" global label="pi.broker_address" placeholder="pi.broker_address_placeholder" hint="pi.broker_address_hint"></pi-field>
                    <pi-field setting="brokerUser" global label="pi.broker_user"></pi-field>
                    <pi-field setting="brokerPassword" global type="password" label="pi.broker_password"></pi-field>
                    <pi-toggle setting="allowSelfSigned" global label="pi.allow_self_signed" hint="pi.allow_self_signed_hint"></pi-toggle>
                    <div class="mqc-conn-actions">
                        <button type="button" class="pi-button pi-button-primary mqc-connect">${escapeHtml(t("pi.connect"))}</button>
                    </div>
                </div>
            </div>`;
        this.querySelector(".mqc-conn-toggle")!.addEventListener("click", () => {
            this.expanded = !this.expanded;
            this.render();
        });
        this.querySelector(".mqc-connect")!.addEventListener("click", () => {
            // Let a field that still has focus save first
            (document.activeElement as HTMLElement | null)?.blur();
            setTimeout(() => sd.sendToPlugin({ event: "reconnect" }), 50);
        });
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event !== "status") return;
                const wasOnline = this.status?.state === "online";
                this.status = msg.status;
                if (!wasOnline && msg.status.state === "online") reloadPiSelects();
                this.render();
                this.dispatchEvent(new CustomEvent("mqc-status", { bubbles: true, detail: msg.status }));
            }),
            sd.onGlobalSettings(() => this.render()),
        );
        this.render();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    private render(): void {
        const s = this.status;
        const state = s?.state ?? "connecting";
        document.body.dataset.connection = state === "online" ? "up" : "down";
        this.querySelector<HTMLElement>(".pi-dot")!.dataset.status = DOT[state];
        this.querySelector(".mqc-conn-title")!.textContent = t(`pi.state_${state}`);
        const sub = state === "online" ? [s?.address, s?.topics ? t("pi.topics_known", { n: s.topics }) : ""].filter(Boolean).join(" · ") : state === "offline" && s?.error ? `${s.address ?? ""} · ${s.error}` : (s?.address ?? "");
        this.querySelector(".mqc-conn-sub")!.textContent = sub;
        const toggle = this.querySelector<HTMLElement>(".mqc-conn-toggle")!;
        toggle.hidden = state !== "online";
        toggle.textContent = this.expanded ? t("pi.done") : t("pi.change");
        this.querySelector<HTMLElement>(".mqc-conn-body")!.hidden = state === "online" && !this.expanded;
    }
}
