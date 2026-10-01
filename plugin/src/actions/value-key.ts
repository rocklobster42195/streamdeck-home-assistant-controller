// Value key: shows a value with its unit (temperature, power, humidity, a door's state), as large
// text or on a half-circle gauge, coloured by the user's colour ranges.
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiThermometer } from "@mdi/js";
import { numberSetting, shownValue, zonesOf } from "../mqtt/value-state";
import { broker } from "../mqtt/connection";
import { renderKeyHint } from "../render/switch-key";
import { renderValueKey } from "../render/value-key";
import { TopicKey, type KeyInstance, type TopicKeySettings } from "./topic-key";

export type ValueKeySettings = TopicKeySettings & {
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

@action({ UUID: "de.boriskemper.mqtt-controller.value" })
export class ValueKey extends TopicKey<ValueKeySettings> {
    constructor() {
        super("value");
    }

    protected override topicsOf(s: ValueKeySettings): (string | undefined)[] {
        return [s.stateTopic];
    }

    /** Nothing to switch: a press only shows that the key is alive. */
    protected override press(inst: KeyInstance<ValueKeySettings>): void {
        void inst.action.showOk();
    }

    protected override image(inst: KeyInstance<ValueKeySettings>): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        if (broker.state === "unconfigured" || broker.state === "invalid") return renderKeyHint(t("key.no_broker"), mdiThermometer, true);
        if (!s.stateTopic?.trim()) return renderKeyHint(t("key.choose_topic"), mdiThermometer);
        const v = shownValue(this.payload(s.stateTopic), s.field, s.decimals);
        return renderValueKey({
            look: s.look === "gauge" ? "gauge" : "text",
            text: v.text,
            number: v.number,
            unit: s.unit,
            label: s.label,
            icon: mdiPath(s.icon),
            zones: zonesOf(s.color || "#FFFFFF", s.thresholds),
            min: numberSetting(s.min, 0),
            max: numberSetting(s.max, 100),
            offline: this.isOffline(inst),
        });
    }
}
