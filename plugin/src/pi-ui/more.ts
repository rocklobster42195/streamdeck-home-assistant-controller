// HA-C's lines in the short PI that open the settings window (the button itself is the kit's <pi-more>):
// <hac-states-summary>: the Multi-state states in one line, opening the window at them.
// <hac-sources>: one line per connection (Home Assistant, MQTT broker) with its state; a click
//   opens the window at the connections. While nothing is set up it asks for that instead.
import { escapeHtml, openSettingsWindow, sd, showSettingsInline, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { ConnectionStatus, HaStatus, PiPush } from "../pi/protocol";

const filled = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

/**
 * <hac-states-summary>: the Multi-state key's states in one line ("3 states: auto · color · …") in
 * the short panel; a click opens the window at the states, where they are edited.
 */
export class HacStatesSummary extends HTMLElement {
    private off: (() => void) | undefined;

    connectedCallback(): void {
        this.addEventListener("click", () => {
            if (!openSettingsWindow("states")) showSettingsInline();
        });
        this.off = sd.onSettings(() => this.render());
        this.render();
    }

    disconnectedCallback(): void {
        this.off?.();
    }

    private render(): void {
        const raw = (sd.settings as Record<string, unknown>).states;
        const states = Array.isArray(raw) ? (raw as { value?: string; label?: string; color?: string }[]).filter((s) => s?.value) : [];
        const chips = states.map((s) => `<span class="hac-states-chip"><span class="hac-states-dot" style="background:${escapeHtml(s.color || "#F7A600")}"></span>${escapeHtml(s.label?.trim() || s.value!)}</span>`).join("");
        this.innerHTML = `
            <div class="pi-section-title">${escapeHtml(t("pi.states"))}</div>
            <button type="button" class="pi-card hac-states-summary">
                <span class="pi-label">${escapeHtml(states.length ? t("pi.states_count", { n: states.length }) : t("pi.states_none"))}</span>
                ${chips ? `<span class="hac-states-chips">${chips}</span>` : ""}
                <span class="pi-hint">${escapeHtml(t("pi.states_edit"))}</span>
            </button>`;
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
            if (!openSettingsWindow("connections")) showSettingsInline();
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
