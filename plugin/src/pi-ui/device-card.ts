// <hac-device-card>: the opt-in "Stream Deck in Home Assistant anzeigen" (global setting haDevice),
// next to the connection cards; says what appears in HA (grills 2026-10-01 and 2026-10-09).
import { escapeHtml, t } from "@rocklobster42195/streamdeck-kit/pi";

export class HacDeviceCard extends HTMLElement {
    connectedCallback(): void {
        this.innerHTML = `
            <div class="pi-section-title">${escapeHtml(t("pi.ha_device"))}</div>
            <div class="pi-card">
                <pi-toggle setting="haDevice" global label="pi.ha_device_show" hint="pi.ha_device_hint"></pi-toggle>
            </div>`;
    }
}
