// The connection cards, shared by all HA-C actions (global settings): <hac-ha-card> for Home
// Assistant (address, token, search on the network) and <hac-connection-card> for the MQTT broker
// (address, login, "allow self-signed certificates"). Each shows a status line and a Connect button.
// A source that isn't set up while the other one is folds away to one line: users with only one
// line never have to look at the other.
import { escapeHtml, nextRequestId, reloadPiSelects, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { FoundHa } from "../ha/zeroconf";
import type { ConnectionStatus, HaStatus, PiPush } from "../pi/protocol";

type State = ConnectionStatus["state"];
type Settings = Record<string, unknown>;

const DOT: Record<State, string> = { online: "ok", connecting: "warn", offline: "error", denied: "error", invalid: "error", unconfigured: "" };

const filled = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";
const haConfigured = (g: Settings): boolean => filled(g.haUrl) || filled(g.haToken);
const brokerConfigured = (g: Settings): boolean => filled(g.brokerUrl);

abstract class SourceCard<S extends { state: State; address?: string; error?: string }> extends HTMLElement {
    protected status: S | undefined;
    private expanded = false;
    protected offs: (() => void)[] = [];

    /** Locale key of the section title. */
    protected abstract readonly titleKey: string;
    /** Locale key prefix of the state texts ("pi.state_" → "pi.state_online"). */
    protected abstract readonly statePrefix: string;
    /** The plugin's status push for this card, and the request that connects again. */
    protected abstract readonly statusEvent: "status" | "ha-status";
    protected abstract readonly reconnectEvent: "reconnect" | "ha-reconnect";
    protected abstract fields(): string;
    /** What the status line says while online. */
    protected abstract onlineDetail(s: S): string;
    protected abstract configured(g: Settings): boolean;
    protected abstract otherConfigured(g: Settings): boolean;
    protected wire(): void {}

    connectedCallback(): void {
        this.innerHTML = `
            <div class="pi-section-title">${escapeHtml(t(this.titleKey))}</div>
            <div class="pi-card">
                <div class="pi-padded">
                    <div class="hac-conn-head">
                        <span class="pi-dot pi-dot-lg"></span>
                        <div class="pi-select-text"><span class="pi-strong hac-conn-title"></span><span class="pi-hint hac-conn-sub"></span></div>
                        <button type="button" class="pi-button pi-button-small hac-conn-toggle"></button>
                    </div>
                </div>
                <div class="hac-conn-body">
                    ${this.fields()}
                    <div class="hac-conn-actions">
                        <button type="button" class="pi-button pi-button-primary hac-connect">${escapeHtml(t("pi.connect"))}</button>
                    </div>
                </div>
            </div>`;
        this.querySelector(".hac-conn-toggle")!.addEventListener("click", () => {
            this.expanded = !this.expanded;
            this.render();
        });
        this.querySelector(".hac-connect")!.addEventListener("click", () => {
            // Let a field that still has focus save first
            (document.activeElement as HTMLElement | null)?.blur();
            setTimeout(() => sd.sendToPlugin({ event: this.reconnectEvent }), 50);
        });
        this.wire();
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event !== this.statusEvent) return;
                const wasOnline = this.status?.state === "online";
                this.status = msg.status as unknown as S;
                if (!wasOnline && this.status.state === "online") reloadPiSelects();
                this.render();
                this.statusChanged(this.status);
            }),
            sd.onGlobalSettings(() => this.render()),
        );
        this.render();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    protected statusChanged(_s: S): void {}

    protected render(): void {
        const s = this.status;
        const state = s?.state ?? "connecting";
        const g = sd.globalSettings as Settings;
        // Not set up while the other source is: one line with "Set up"
        const aside = state === "unconfigured" && !this.configured(g) && this.otherConfigured(g);
        this.querySelector<HTMLElement>(".pi-dot")!.dataset.status = DOT[state];
        this.querySelector(".hac-conn-title")!.textContent = aside ? t("pi.not_set_up") : t(`${this.statePrefix}${state}`);
        const sub = aside ? t("pi.optional") : state === "online" && s ? this.onlineDetail(s) : state === "offline" && s?.error ? `${s.address ?? ""} · ${s.error}` : (s?.address ?? "");
        this.querySelector(".hac-conn-sub")!.textContent = sub;
        const toggle = this.querySelector<HTMLElement>(".hac-conn-toggle")!;
        toggle.hidden = state !== "online" && !aside;
        toggle.textContent = this.expanded ? t("pi.done") : aside ? t("pi.set_up") : t("pi.change");
        this.querySelector<HTMLElement>(".hac-conn-body")!.hidden = (state === "online" || aside) && !this.expanded;
    }
}

/** <hac-ha-card>: the Home Assistant connection. */
export class HacHaCard extends SourceCard<HaStatus> {
    protected readonly titleKey = "pi.ha";
    protected readonly statePrefix = "pi.ha_state_";
    protected readonly statusEvent = "ha-status";
    protected readonly reconnectEvent = "ha-reconnect";
    private findId = 0;

    protected fields(): string {
        return `
            <pi-field setting="haUrl" global label="pi.ha_address" placeholder="pi.ha_address_placeholder" hint="pi.ha_address_hint"></pi-field>
            <div class="hac-conn-actions">
                <button type="button" class="pi-button hac-ha-find">${escapeHtml(t("pi.ha_find"))}</button>
                <div class="hac-ha-found"></div>
            </div>
            <pi-field setting="haToken" global type="password" label="pi.ha_token" hint="pi.ha_token_hint"></pi-field>`;
    }

    protected onlineDetail(s: HaStatus): string {
        return [s.address, s.version ?? "", s.entities ? t("pi.entities_known", { n: s.entities }) : ""].filter(Boolean).join(" · ");
    }

    protected configured(g: Settings): boolean {
        return haConfigured(g);
    }

    protected otherConfigured(g: Settings): boolean {
        return brokerConfigured(g);
    }

    protected override wire(): void {
        const button = this.querySelector<HTMLButtonElement>(".hac-ha-find")!;
        const list = this.querySelector<HTMLElement>(".hac-ha-found")!;
        button.addEventListener("click", () => {
            this.findId = nextRequestId();
            button.disabled = true;
            button.textContent = t("pi.ha_finding");
            list.innerHTML = "";
            sd.sendToPlugin({ event: "ha-find", requestId: this.findId });
        });
        this.offs.push(sd.onMessage((msg: PiPush) => {
            if (msg?.event !== "ha-find-result" || msg.requestId !== this.findId) return;
            button.disabled = false;
            button.textContent = t("pi.ha_find");
            list.innerHTML = msg.found.length
                ? msg.found.map((f, i) => `<button type="button" class="pi-button pi-button-small hac-ha-pick" data-i="${i}">${escapeHtml(label(f))}</button>`).join("")
                : `<div class="pi-hint">${escapeHtml(t("pi.ha_found_none"))}</div>`;
            list.querySelectorAll<HTMLElement>(".hac-ha-pick").forEach((b) =>
                b.addEventListener("click", () => {
                    sd.setGlobalSetting("haUrl", msg.found[Number(b.dataset.i)].url);
                    list.innerHTML = "";
                }),
            );
        }));
    }
}

function label(f: FoundHa): string {
    return `${f.name} · ${f.url}${f.version ? ` · ${f.version}` : ""}`;
}

/** <hac-connection-card>: the MQTT broker connection. */
export class HacConnectionCard extends SourceCard<ConnectionStatus> {
    protected readonly titleKey = "pi.broker";
    protected readonly statePrefix = "pi.state_";
    protected readonly statusEvent = "status";
    protected readonly reconnectEvent = "reconnect";

    protected fields(): string {
        return `
            <pi-field setting="brokerUrl" global label="pi.broker_address" placeholder="pi.broker_address_placeholder" hint="pi.broker_address_hint"></pi-field>
            <pi-field setting="brokerUser" global label="pi.broker_user"></pi-field>
            <pi-field setting="brokerPassword" global type="password" label="pi.broker_password"></pi-field>
            <pi-toggle setting="allowSelfSigned" global label="pi.allow_self_signed" hint="pi.allow_self_signed_hint"></pi-toggle>`;
    }

    protected onlineDetail(s: ConnectionStatus): string {
        return [s.address, s.topics ? t("pi.topics_known", { n: s.topics }) : ""].filter(Boolean).join(" · ");
    }

    protected configured(g: Settings): boolean {
        return brokerConfigured(g);
    }

    protected otherConfigured(g: Settings): boolean {
        return haConfigured(g);
    }

    protected override render(): void {
        super.render();
        document.body.dataset.connection = this.status?.state === "online" ? "up" : "down";
    }

    protected override statusChanged(s: ConnectionStatus): void {
        this.dispatchEvent(new CustomEvent("hac-status", { bubbles: true, detail: s }));
    }
}
