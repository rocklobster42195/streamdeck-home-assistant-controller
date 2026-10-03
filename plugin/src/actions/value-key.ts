// Value key: shows a value with its unit (temperature, power, humidity, a door's state) from a Home
// Assistant entity or an MQTT topic, as large text or on a half-circle gauge, coloured by the user's
// colour ranges; with HA, the state or one of the entity's attributes. Optionally a second, smaller
// value below (another attribute or entity, or another topic). A press (HA: on another entity, MQTT:
// on topics) can do nothing,
// switch something on and off (then it looks like the Switch key), or send a fixed payload.
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiThermometer } from "@mdi/js";
import { ha } from "../ha/connection";
import { haName, haTriggerService } from "../ha/entities";
import { haIconPath } from "../ha/icons";
import { numberSetting, shownValue, zonesOf } from "../mqtt/value-state";
import { ACCENT } from "../render/svg";
import { renderKeyHint } from "../render/switch-key";
import { renderValueKey } from "../render/value-key";
import { pressListenTopic, pressState, runPress, type PressSettings } from "./press-action";
import { HaToggle } from "./ha-toggle";
import { Toggle } from "./toggle";
import { TopicKey, type KeyInstance, type TopicKeySettings } from "./topic-key";

export type ValueKeySettings = TopicKeySettings &
    PressSettings & {
        stateTopic?: string;
        field?: string;
        unit?: string;
        /** Decimals to show; empty keeps the device's precision. */
        decimals?: string;
        look?: "text" | "gauge" | "open";
        min?: string;
        max?: string;
        /** Colour below the first threshold. */
        color?: string;
        thresholds?: JsonObject[];
        icon?: string;
        label?: string;
        /** HA: what a press switches ("toggle") or runs ("send"): a light, a scene, … */
        pressEntityId?: string;
        /** HA: the attribute to show instead of the state. */
        attribute?: string;
        /** Second value. HA: an entity (empty: the key's own) and attribute; MQTT: a topic and field. */
        secondEntityId?: string;
        secondAttribute?: string;
        secondTopic?: string;
        secondField?: string;
        secondUnit?: string;
        secondDecimals?: string;
    };

@action({ UUID: "de.boriskemper.ha-controller.value" })
export class ValueKey extends TopicKey<ValueKeySettings> {
    private readonly toggle = new Toggle((id) => this.redraw(id));
    private readonly haToggle = new HaToggle((id) => this.redraw(id));

    protected override readonly haCapable = true;

    constructor() {
        super("value");
    }

    protected override topicsOf(s: ValueKeySettings): (string | undefined)[] {
        return [s.stateTopic, s.secondTopic, pressListenTopic(s)];
    }

    protected override moreEntities(s: ValueKeySettings): (string | undefined)[] {
        return [s.secondEntityId, s.pressAction === "toggle" ? s.pressEntityId : undefined];
    }

    protected override press(inst: KeyInstance<ValueKeySettings>): void {
        if (this.source(inst) === "ha") return this.pressHa(inst);
        const result = runPress(inst.settings, this.toggle, inst.id, "value");
        if (result === "failed") this.feedback(inst, "alert");
        else if (result === "ok") this.feedback(inst, "ok", inst.settings.pressColor || ACCENT);
        this.render(inst);
    }

    protected override disappeared(inst: KeyInstance<ValueKeySettings>): void {
        this.toggle.forget(inst.id);
        this.haToggle.forget(inst.id);
    }

    private redraw(id: string): void {
        const inst = this.instances.get(id);
        if (inst) this.render(inst);
    }

    /** HA press: switch another entity on and off, or run a scene, script, button or automation. */
    private pressHa(inst: KeyInstance<ValueKeySettings>): void {
        const s = inst.settings;
        const target = s.pressEntityId?.trim();
        if (!s.pressAction || s.pressAction === "none") return;
        if (!target) return this.feedback(inst, "alert");
        if (s.pressAction === "toggle") {
            if (!this.haToggle.press(inst.id, target)) this.feedback(inst, "alert");
            this.render(inst);
            return;
        }
        const call = haTriggerService(target);
        if (!call) return this.feedback(inst, "alert");
        streamDeck.logger.info(`[ha] ${call.domain}.${call.service} ${target}`);
        void ha.call(call.domain, call.service, target).then((ok) => this.feedback(inst, ok ? "ok" : "alert", s.pressColor || ACCENT));
    }

    /** The second value with its unit; undefined when none is set up. */
    private second(inst: KeyInstance<ValueKeySettings>, fromHa: boolean): string | undefined {
        const s = inst.settings;
        let read: { payload?: string; unit?: string; field?: string };
        if (fromHa) {
            if (!s.secondAttribute?.trim() && !s.secondEntityId?.trim()) return undefined;
            read = ha.read(ha.entities[s.secondEntityId?.trim() || s.entityId || ""], s.secondAttribute);
        } else {
            if (!s.secondTopic?.trim()) return undefined;
            read = { payload: this.payload(s.secondTopic), field: s.secondField };
        }
        const v = shownValue(read.payload, read.field, s.secondDecimals);
        const unit = s.secondUnit?.trim() || read.unit;
        return `${v.text ?? "–"}${unit ? ` ${unit}` : ""}`;
    }

    protected override image(inst: KeyInstance<ValueKeySettings>): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        const hint = this.sourceHint(inst, mdiThermometer);
        if (hint) return hint;
        const fromHa = this.source(inst) === "ha";
        if (!fromHa && !s.stateTopic?.trim()) return renderKeyHint(t("key.choose_topic"), mdiThermometer);
        const e = fromHa ? this.entity(inst) : undefined;
        const haV = ha.read(e, s.attribute);
        const v = fromHa ? shownValue(haV.payload, undefined, s.decimals) : shownValue(this.payload(s.stateTopic), s.field, s.decimals);
        const toggled = fromHa ? (s.pressAction === "toggle" && s.pressEntityId?.trim() ? this.haToggle.state(inst.id, s.pressEntityId.trim()) : undefined) : pressState(s, this.toggle, inst.id);
        return renderValueKey({
            look: s.look === "gauge" || s.look === "open" ? s.look : "text",
            text: v.text,
            number: v.number,
            unit: s.unit?.trim() || (fromHa ? haV.unit : undefined),
            second: this.second(inst, fromHa),
            label: this.label(inst, fromHa ? haName(e) : undefined),
            icon: mdiPath(s.icon) ?? (fromHa ? haIconPath(e) : undefined),
            zones: zonesOf(s.color || "#FFFFFF", s.thresholds),
            min: numberSetting(s.min, 0),
            max: numberSetting(s.max, 100),
            offline: this.isOffline(inst),
            toggle: toggled === undefined ? undefined : { on: toggled === "on", color: s.pressColor || ACCENT },
        });
    }
}

