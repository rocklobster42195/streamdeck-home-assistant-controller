// Value key: shows a value with its unit (temperature, power, humidity, a door's state) from a Home
// Assistant entity or an MQTT topic, as large text or on a half-circle gauge, coloured by the user's
// colour ranges. A press can do nothing,
// switch something on and off (framed while on), or send a fixed payload.
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiThermometer } from "@mdi/js";
import { haIcon, haName, haValue } from "../ha/entities";
import { numberSetting, shownValue, zonesOf } from "../mqtt/value-state";
import { ACCENT } from "../render/svg";
import { renderKeyHint } from "../render/switch-key";
import { renderValueKey } from "../render/value-key";
import { pressListenTopic, pressState, runPress, type PressSettings } from "./press-action";
import { Toggle } from "./toggle";
import { TopicKey, type KeyInstance, type TopicKeySettings } from "./topic-key";

export type ValueKeySettings = TopicKeySettings &
    PressSettings & {
        stateTopic?: string;
        field?: string;
        unit?: string;
        /** Decimals to show; empty keeps the device's precision. */
        decimals?: string;
        look?: "text" | "gauge";
        min?: string;
        max?: string;
        /** Colour below the first threshold. */
        color?: string;
        thresholds?: JsonObject[];
        icon?: string;
        label?: string;
    };

@action({ UUID: "de.boriskemper.ha-controller.value" })
export class ValueKey extends TopicKey<ValueKeySettings> {
    private readonly toggle = new Toggle((id) => {
        const inst = this.instances.get(id);
        if (inst) this.render(inst);
    });

    protected override readonly haCapable = true;

    constructor() {
        super("value");
    }

    protected override topicsOf(s: ValueKeySettings): (string | undefined)[] {
        return [s.stateTopic, pressListenTopic(s)];
    }

    protected override press(inst: KeyInstance<ValueKeySettings>): void {
        // The press action works on MQTT topics; HA entities get theirs later
        if (this.source(inst) === "ha") return;
        const result = runPress(inst.settings, this.toggle, inst.id, "value");
        if (result === "failed") void inst.action.showAlert();
        else if (result === "ok") void inst.action.showOk();
        this.render(inst);
    }

    protected override disappeared(inst: KeyInstance<ValueKeySettings>): void {
        this.toggle.forget(inst.id);
    }

    protected override image(inst: KeyInstance<ValueKeySettings>): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        const hint = this.sourceHint(inst, mdiThermometer);
        if (hint) return hint;
        const fromHa = this.source(inst) === "ha";
        if (!fromHa && !s.stateTopic?.trim()) return renderKeyHint(t("key.choose_topic"), mdiThermometer);
        const e = fromHa ? this.entity(inst) : undefined;
        const haV = haValue(e);
        const v = fromHa ? shownValue(haV.payload, undefined, s.decimals) : shownValue(this.payload(s.stateTopic), s.field, s.decimals);
        const toggled = fromHa ? undefined : pressState(s, this.toggle, inst.id);
        return renderValueKey({
            look: s.look === "gauge" ? "gauge" : "text",
            text: v.text,
            number: v.number,
            unit: s.unit?.trim() || (fromHa ? haV.unit : undefined),
            label: s.label?.trim() || (fromHa ? haName(e) : undefined),
            icon: mdiPath(s.icon) ?? (fromHa ? mdiPath(haIcon(e)) : undefined),
            zones: zonesOf(s.color || "#FFFFFF", s.thresholds),
            min: numberSetting(s.min, 0),
            max: numberSetting(s.max, 100),
            offline: this.isOffline(inst),
            frame: toggled === "on" ? s.pressColor || ACCENT : undefined,
        });
    }
}

