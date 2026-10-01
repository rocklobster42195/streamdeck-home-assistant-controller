// Fields for keys on a Home Assistant entity:
// <hac-ha-attribute setting="attribute" entity-setting="entityId" [fallback-setting="entityId"]>
//   picks the state or one of the entity's attributes, each with its current value.
// <hac-ha-entity setting="secondEntityId" placeholder="…">: another entity id, typed with
//   suggestions from all of HA's entities; empty means the key's own entity.
import { escapeHtml, nextRequestId, sd, t } from "@rocklobster42195/streamdeck-kit/pi";
import type { PiPush } from "../pi/protocol";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function fieldMarkup(label: string | null, control: string, hint: string | null): string {
    return `<label>
        ${label ? `<span class="pi-field-label">${escapeHtml(t(label))}</span>` : ""}
        <span class="pi-input-row">${control}</span>
        ${hint ? `<span class="pi-hint">${escapeHtml(t(hint))}</span>` : ""}
    </label>`;
}

export class HacHaAttribute extends HTMLElement {
    private requestId = 0;
    private entity = "";
    private state: string | undefined;
    private attributes: { name: string; value: string }[] = [];
    private offs: (() => void)[] = [];

    private get setting(): string {
        return this.getAttribute("setting") ?? "attribute";
    }

    connectedCallback(): void {
        this.classList.add("pi-field");
        this.innerHTML = fieldMarkup(this.getAttribute("label") ?? "pi.attribute", `<select class="pi-input hac-ha-attribute"></select>`, this.getAttribute("hint"));
        this.querySelector("select")!.addEventListener("change", (e) => sd.setSetting(this.setting, (e.target as HTMLSelectElement).value));
        this.offs.push(
            sd.onSettings(() => this.load()),
            sd.onMessage((msg: PiPush) => {
                if (msg?.event === "ha-attributes-result" && msg.requestId === this.requestId) {
                    this.state = msg.state;
                    this.attributes = msg.attributes;
                    this.render();
                } else if (msg?.event === "ha-status" && msg.status.state === "online") {
                    this.load(true);
                }
            }),
        );
        this.load(true);
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    private entityId(): string {
        const s = sd.settings as Record<string, unknown>;
        return str(s[this.getAttribute("entity-setting") ?? "entityId"]) || str(s[this.getAttribute("fallback-setting") ?? ""]);
    }

    private load(force = false): void {
        const id = this.entityId();
        if (!force && id === this.entity) return this.render();
        this.entity = id;
        this.requestId = nextRequestId();
        if (id) sd.sendToPlugin({ event: "ha-attributes", requestId: this.requestId, entityId: id });
        else {
            this.state = undefined;
            this.attributes = [];
        }
        this.render();
    }

    private render(): void {
        const current = str((sd.settings as Record<string, unknown>)[this.setting]);
        const options = [{ value: "", label: `${t("pi.attribute_state")}${this.state !== undefined ? ` (${this.state})` : ""}` }, ...this.attributes.map((a) => ({ value: a.name, label: `${a.name} (${a.value})` }))];
        // A chosen attribute the entity doesn't report right now stays selectable
        if (current && !options.some((o) => o.value === current)) options.push({ value: current, label: current });
        const select = this.querySelector("select")!;
        select.innerHTML = options.map((o) => `<option value="${escapeHtml(o.value)}"${o.value === current ? " selected" : ""}>${escapeHtml(o.label.length > 60 ? `${o.label.slice(0, 59)}…` : o.label)}</option>`).join("");
    }
}

export class HacHaEntity extends HTMLElement {
    private static listId = `hac-ha-entities-${Math.random().toString(16).slice(2, 8)}`;
    private requestId = 0;
    private offs: (() => void)[] = [];

    private get setting(): string {
        return this.getAttribute("setting") ?? "entityId";
    }

    connectedCallback(): void {
        this.classList.add("pi-field");
        const placeholder = this.getAttribute("placeholder");
        this.innerHTML = fieldMarkup(
            this.getAttribute("label"),
            `<input class="pi-input" type="text" spellcheck="false" autocomplete="off" list="${HacHaEntity.listId}" ${placeholder ? `placeholder="${escapeHtml(t(placeholder))}"` : ""}/>`,
            this.getAttribute("hint"),
        );
        const input = this.querySelector("input")!;
        const commit = () => sd.setSetting(this.setting, input.value.trim());
        input.addEventListener("change", commit);
        input.addEventListener("keydown", (e) => e.key === "Enter" && commit());
        this.offs.push(
            sd.onSettings(() => this.render()),
            sd.onMessage((msg: PiPush) => {
                if (msg?.event === "ha-entity-list-result" && msg.requestId === this.requestId) this.fillList(msg.entities);
                else if (msg?.event === "ha-status" && msg.status.state === "online") this.loadList();
            }),
        );
        this.loadList();
        this.render();
    }

    disconnectedCallback(): void {
        for (const off of this.offs) off();
    }

    private loadList(): void {
        this.requestId = nextRequestId();
        sd.sendToPlugin({ event: "ha-entity-list", requestId: this.requestId });
    }

    /** One datalist for all entity fields on the page. */
    private fillList(entities: { id: string; name: string }[]): void {
        let list = document.getElementById(HacHaEntity.listId);
        if (!list) {
            list = document.createElement("datalist");
            list.id = HacHaEntity.listId;
            document.body.append(list);
        }
        list.innerHTML = entities.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)}</option>`).join("");
    }

    private render(): void {
        const input = this.querySelector("input")!;
        if (document.activeElement !== input) input.value = str((sd.settings as Record<string, unknown>)[this.setting]);
    }
}
