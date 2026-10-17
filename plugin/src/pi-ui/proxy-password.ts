// <hac-proxy-password>: the proxy password. It is never written to a setting: it goes to the plugin
// as a message, which stores it encrypted (see ../secret.ts). The field itself stays empty and says
// that one is saved; typing a new one replaces it, clearing it after typing removes it.
import { escapeHtml, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { PiPush } from "../pi/protocol";

export class HacProxyPassword extends HTMLElement {
    private offs: (() => void)[] = [];
    private state = { set: false, encrypted: false };

    connectedCallback(): void {
        this.classList.add("pi-field");
        this.innerHTML = `<label>
            <span class="pi-field-label">${escapeHtml(t("pi.proxy_password"))}</span>
            <span class="pi-input-row"><input class="pi-input" type="password" autocomplete="new-password" spellcheck="false"/></span>
            <span class="pi-hint hac-proxy-note"></span>
        </label>`;
        const input = this.querySelector("input")!;
        let typed = false;
        input.addEventListener("input", () => (typed = true));
        const commit = () => {
            if (!typed) return;
            typed = false;
            const value = input.value;
            input.value = "";
            // The answer comes as proxy-password-state; until then show what is expected
            this.state = { set: value.trim() !== "", encrypted: this.state.encrypted };
            this.render();
            sd.sendToPlugin({ event: "proxy-password", value });
        };
        input.addEventListener("change", commit);
        input.addEventListener("keydown", (e) => e.key === "Enter" && commit());
        this.offs.push(
            sd.onMessage((msg: PiPush) => {
                if (msg?.event !== "proxy-password-state") return;
                this.state = { set: msg.set, encrypted: msg.encrypted };
                this.render();
            }),
        );
        this.render();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    private render(): void {
        const input = this.querySelector("input")!;
        input.placeholder = this.state.set ? t("pi.proxy_password_saved") : "";
        const note = this.state.set && !this.state.encrypted ? t("pi.proxy_password_plain") : t("pi.proxy_password_hint");
        this.querySelector(".hac-proxy-note")!.textContent = note;
    }
}
