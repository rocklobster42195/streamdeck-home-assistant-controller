// <hac-states setting="states" topic-setting="stateTopic" field-setting="field">
// The Multi-state key's list: one row per state with its value, a name, a colour and an icon
// (searched like the kit's icon picker). Rows can be added empty, or from the value the device
// reports right now, and moved up. Stored as [{ value, label?, icon?, color? }].
import { escapeHtml, nextRequestId, sd, t, type KitPiPush } from "@rocklobster42195/streamdeck-kit/pi";
import type { StateOption } from "../mqtt/multi-state";
import type { PiPush } from "../pi/protocol";

const COLORS = ["#F7A600", "#3ddc84", "#6cc4ff", "#ff4d4d", "#E14190", "#f5c542"];
const svg = (path: string | undefined, size = 22) => (path ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" d="${escapeHtml(path)}"/></svg>` : "");

export class HacStates extends HTMLElement {
    /** Icon name → path ("" when unknown), filled from the plugin's icon catalog. */
    private readonly paths = new Map<string, string>();
    private readonly pending = new Map<number, string>();
    /** The row whose icon search is open, its query and results. */
    private picking = -1;
    private searchId = 0;
    private results: { value: string; label: string; icon?: string }[] = [];
    private currentValue: string | undefined;
    private infoId = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private offs: (() => void)[] = [];

    private get key(): string {
        return this.getAttribute("setting") ?? "states";
    }

    private get rows(): StateOption[] {
        const raw = sd.settings[this.key];
        return Array.isArray(raw) ? (raw as StateOption[]).map((r) => ({ ...r })) : [];
    }

    connectedCallback(): void {
        this.classList.add("hac-states");
        this.offs.push(
            sd.onMessage((msg: KitPiPush | PiPush) => {
                if (msg?.event === "options-result") {
                    if (msg.requestId === this.searchId) {
                        this.results = msg.items;
                        this.renderResults();
                    } else if (this.pending.has(msg.requestId)) {
                        const name = this.pending.get(msg.requestId)!;
                        this.pending.delete(msg.requestId);
                        // Unknown names are remembered too, so they aren't asked for again
                        this.paths.set(name, msg.items[0]?.icon ?? "");
                        this.render();
                    }
                } else if (msg?.event === "ha-attributes-result" && msg.requestId === this.infoId) {
                    this.currentValue = msg.state;
                    this.render();
                } else if (msg?.event === "topic-info-result" && msg.requestId === this.infoId) {
                    const field = this.getAttribute("field-setting");
                    const f = field ? String(sd.settings[field] ?? "") : "";
                    this.currentValue = f ? msg.info.fields.find((x) => x.path === f)?.value : msg.info.payload;
                    this.render();
                }
            }),
            sd.onSettings(() => {
                this.requestCurrent();
                this.render();
            }),
        );
        this.requestCurrent();
        this.render();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    private save(rows: StateOption[]): void {
        sd.setSetting(this.key, rows);
    }

    private requestCurrent(): void {
        // A key on an HA entity: its state is the current value
        const entityId = sd.settings.source === "ha" ? String(sd.settings.entityId ?? "").trim() : "";
        if (entityId) {
            this.infoId = nextRequestId();
            sd.sendToPlugin({ event: "ha-attributes", requestId: this.infoId, entityId });
            return;
        }
        const topic = String(sd.settings[this.getAttribute("topic-setting") ?? "stateTopic"] ?? "").trim();
        if (!topic) return;
        this.infoId = nextRequestId();
        sd.sendToPlugin({ event: "topic-info", requestId: this.infoId, topic });
    }

    /** Ask the plugin for the paths of icons we don't know yet. */
    private lookupIcons(rows: StateOption[]): void {
        for (const name of new Set(rows.map((r) => r.icon).filter((n): n is string => !!n))) {
            if (this.paths.has(name) || [...this.pending.values()].includes(name)) continue;
            const id = nextRequestId();
            this.pending.set(id, name);
            sd.sendToPlugin({ event: "options", requestId: id, source: "mdi-icons", params: { q: name } });
        }
    }

    private render(): void {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && this.contains(active) && active.type === "text") return;
        const rows = this.rows;
        this.lookupIcons(rows);
        const cur = this.currentValue?.trim();
        const hasCurrent = !!cur && cur.length <= 40 && !rows.some((r) => r.value.trim().toLowerCase() === cur.toLowerCase());
        this.innerHTML = `
            ${rows
                .map(
                    (r, i) => `
                <div class="hac-state-row" data-i="${i}">
                    <button type="button" class="pi-icon-button hac-state-icon" title="${escapeHtml(t("pi.state_icon"))}" style="color:${escapeHtml(r.color || "#F7A600")}">${svg(r.icon ? this.paths.get(r.icon) || undefined : undefined) || "+"}</button>
                    <input class="pi-input hac-state-value" type="text" spellcheck="false" placeholder="${escapeHtml(t("pi.state_value"))}" value="${escapeHtml(r.value ?? "")}"/>
                    <input class="pi-input hac-state-label" type="text" placeholder="${escapeHtml(t("pi.state_label"))}" value="${escapeHtml(r.label ?? "")}"/>
                    <input class="pi-color" type="color" value="${escapeHtml(r.color || "#F7A600")}"/>
                    <button type="button" class="pi-icon-button hac-state-up" title="${escapeHtml(t("pi.state_up"))}" ${i === 0 ? "disabled" : ""}>↑</button>
                    <button type="button" class="pi-icon-button hac-state-remove" title="${escapeHtml(t("kit.threshold_remove"))}">×</button>
                </div>
                ${this.picking === i ? `<div class="hac-state-picker"><input class="pi-input hac-state-search" type="search" placeholder="${escapeHtml(t("kit.icon_search"))}"/><div class="pi-icon-grid hac-state-results"></div></div>` : ""}`,
                )
                .join("")}
            <div class="hac-state-actions">
                <button type="button" class="pi-button pi-button-small hac-state-add">${escapeHtml(t("pi.state_add"))}</button>
                ${hasCurrent ? `<button type="button" class="pi-button pi-button-small hac-state-add-current">${escapeHtml(t("pi.state_add_current", { value: cur! }))}</button>` : ""}
            </div>`;

        const rowOf = (el: Element) => Number((el.closest(".hac-state-row") as HTMLElement).dataset.i);
        const edit = (el: Element, patch: Partial<StateOption>) => {
            const next = this.rows;
            Object.assign(next[rowOf(el)], patch);
            this.save(next);
        };
        this.querySelectorAll<HTMLInputElement>(".hac-state-value").forEach((el) => el.addEventListener("change", () => edit(el, { value: el.value.trim() })));
        this.querySelectorAll<HTMLInputElement>(".hac-state-label").forEach((el) => el.addEventListener("change", () => edit(el, { label: el.value.trim() || undefined })));
        this.querySelectorAll<HTMLInputElement>(".hac-state-row .pi-color").forEach((el) => el.addEventListener("change", () => edit(el, { color: el.value })));
        this.querySelectorAll<HTMLElement>(".hac-state-remove").forEach((el) =>
            el.addEventListener("click", () => {
                this.picking = -1;
                this.save(this.rows.filter((_, i) => i !== rowOf(el)));
            }),
        );
        this.querySelectorAll<HTMLElement>(".hac-state-up").forEach((el) =>
            el.addEventListener("click", () => {
                const i = rowOf(el);
                const next = this.rows;
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                this.picking = -1;
                this.save(next);
            }),
        );
        this.querySelectorAll<HTMLElement>(".hac-state-icon").forEach((el) =>
            el.addEventListener("click", () => {
                const i = rowOf(el);
                this.picking = this.picking === i ? -1 : i;
                this.results = [];
                this.render();
                this.querySelector<HTMLInputElement>(".hac-state-search")?.focus();
            }),
        );
        const search = this.querySelector<HTMLInputElement>(".hac-state-search");
        search?.addEventListener("input", () => {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => {
                this.searchId = nextRequestId();
                sd.sendToPlugin({ event: "options", requestId: this.searchId, source: "mdi-icons", params: { q: search.value.trim() } });
            }, 250);
        });
        this.querySelector(".hac-state-add")!.addEventListener("click", () => this.save([...this.rows, { value: "", color: COLORS[this.rows.length % COLORS.length] }]));
        this.querySelector(".hac-state-add-current")?.addEventListener("click", () => this.save([...this.rows, { value: cur!, color: COLORS[this.rows.length % COLORS.length] }]));
    }

    private renderResults(): void {
        const grid = this.querySelector<HTMLElement>(".hac-state-results");
        if (!grid) return;
        grid.innerHTML = this.results.map((r, n) => `<button type="button" class="pi-icon-tile" data-n="${n}" title="${escapeHtml(r.label)}">${svg(r.icon)}</button>`).join("");
        grid.querySelectorAll<HTMLElement>(".pi-icon-tile").forEach((el) =>
            el.addEventListener("click", () => {
                const r = this.results[Number(el.dataset.n)];
                if (r.icon) this.paths.set(r.value, r.icon);
                const next = this.rows;
                next[this.picking].icon = r.value;
                this.picking = -1;
                this.save(next);
            }),
        );
    }
}
