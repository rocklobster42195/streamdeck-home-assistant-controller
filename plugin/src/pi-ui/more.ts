// The short PI's way into the settings window:
// <hac-more ready-when="entityId,stateTopic">: "More settings …", or "Set up …" (blue, with a line
//   saying why) while none of the listed settings is filled in. Opens the window; when it can't,
//   the PI shows everything inline.
// <hac-sources>: one line per connection (Home Assistant, MQTT broker) with its state; a click
//   opens the window at the connections. While nothing is set up it asks for that instead.
import { escapeHtml, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { ConnectionStatus, HaStatus, PiPush } from "../pi/protocol";
import { openSettingsWindow } from "./window";

const filled = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

/** No window: show the window-only parts in the PI itself. */
function showInline(): void {
    document.body.classList.add("hac-inline");
}

export class HacMore extends HTMLElement {
    private off: (() => void) | undefined;

    connectedCallback(): void {
        this.innerHTML = `<button type="button" class="pi-button hac-more-button"></button><span class="pi-hint hac-more-hint" hidden>${escapeHtml(t("pi.set_up_hint"))}</span>`;
        this.querySelector("button")!.addEventListener("click", () => {
            if (!openSettingsWindow()) showInline();
        });
        this.off = sd.onSettings(() => this.render());
        this.render();
    }

    disconnectedCallback(): void {
        this.off?.();
    }

    private render(): void {
        const s = sd.settings as Record<string, unknown>;
        const keys = (this.getAttribute("ready-when") ?? "").split(",").map((k) => k.trim()).filter(Boolean);
        const ready = keys.some((k) => filled(s[k]));
        const button = this.querySelector("button")!;
        button.textContent = t(ready ? "pi.more_settings" : "pi.set_up_key");
        button.classList.toggle("pi-button-primary", !ready);
        // Why the button is blue: the key isn't set up yet
        this.querySelector<HTMLElement>(".hac-more-hint")!.hidden = ready;
    }
}

const DOT: Record<string, string> = { online: "ok", connecting: "warn", offline: "error", denied: "error", invalid: "error", unconfigured: "" };

export class HacSources extends HTMLElement {
    private ha: HaStatus | undefined;
    private mqtt: ConnectionStatus | undefined;
    private offs: (() => void)[] = [];

    connectedCallback(): void {
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event === "ha-status") this.ha = msg.status;
                else if (msg?.event === "status") this.mqtt = msg.status;
                else return;
                this.render();
            }),
            sd.onGlobalSettings(() => this.render()),
        );
        this.addEventListener("click", (e) => {
            if (!(e.target as HTMLElement).closest("button")) return;
            if (!openSettingsWindow("connections")) showInline();
        });
        this.render();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    private render(): void {
        const g = sd.globalSettings as Record<string, unknown>;
        const haSetUp = filled(g.haUrl) || filled(g.haToken);
        const mqttSetUp = filled(g.brokerUrl);
        if (!haSetUp && !mqttSetUp) {
            this.innerHTML = `<button type="button" class="pi-button pi-button-primary hac-sources-setup">${escapeHtml(t("pi.connect_sources"))}</button>`;
            return;
        }
        const row = (name: string, state: string | undefined) =>
            `<button type="button" class="hac-source-row"><span class="pi-dot" data-status="${DOT[state ?? "connecting"] ?? ""}"></span><span class="pi-label">${escapeHtml(name)}</span><span class="pi-hint">${escapeHtml(t(`pi.state_short_${state ?? "connecting"}`))}</span></button>`;
        this.innerHTML = `<div class="hac-sources">${[haSetUp ? row(t("pi.ha"), this.ha?.state) : "", mqttSetUp ? row(t("pi.broker"), this.mqtt?.state) : ""].join("")}</div>`;
    }
}
