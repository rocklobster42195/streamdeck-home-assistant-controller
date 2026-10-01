// Value key: shows a value with its unit (temperature, power, humidity, a door's state), as large
// text or on a half-circle gauge, coloured by the user's colour ranges. A press can do nothing,
// switch something on and off (framed while on), or send a fixed payload.
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiThermometer } from "@mdi/js";
import { broker } from "../mqtt/connection";
import type { SwitchTopics } from "../mqtt/switch-state";
import { numberSetting, shownValue, zonesOf } from "../mqtt/value-state";
import { ACCENT } from "../render/svg";
import { renderKeyHint } from "../render/switch-key";
import { renderValueKey } from "../render/value-key";
import { Toggle } from "./toggle";
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
    /** What a press does. */
    pressAction?: "none" | "toggle" | "send";
    /** Toggle: like the Switch key, with its own topics. */
    pressStateTopic?: string;
    pressCommandTopic?: string;
    pressField?: string;
    pressOnValue?: string;
    pressOffValue?: string;
    pressCommandOn?: string;
    pressCommandOff?: string;
    pressTemplate?: string;
    pressColor?: string;
    /** Send: a fixed payload to a topic. */
    sendTopic?: string;
    sendPayload?: string;
};

@action({ UUID: "de.boriskemper.mqtt-controller.value" })
export class ValueKey extends TopicKey<ValueKeySettings> {
    private readonly toggle = new Toggle((id) => {
        const inst = this.instances.get(id);
        if (inst) this.render(inst);
    });

    constructor() {
        super("value");
    }

    protected override topicsOf(s: ValueKeySettings): (string | undefined)[] {
        return [s.stateTopic, s.pressAction === "toggle" ? s.pressStateTopic : undefined];
    }

    protected override press(inst: KeyInstance<ValueKeySettings>): void {
        const s = inst.settings;
        if (s.pressAction === "toggle") {
            if (!this.toggle.press(inst.id, toggleTopics(s))) void inst.action.showAlert();
            this.render(inst);
        } else if (s.pressAction === "send") {
            const topic = s.sendTopic?.trim();
            if (!topic || !broker.publish(topic, s.sendPayload ?? "")) return void inst.action.showAlert();
            streamDeck.logger.info(`[value] ${topic} ← ${s.sendPayload ?? ""}`);
            void inst.action.showOk();
        }
    }

    protected override disappeared(inst: KeyInstance<ValueKeySettings>): void {
        this.toggle.forget(inst.id);
    }

    protected override image(inst: KeyInstance<ValueKeySettings>): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        if (broker.state === "unconfigured" || broker.state === "invalid") return renderKeyHint(t("key.no_broker"), mdiThermometer, true);
        if (!s.stateTopic?.trim()) return renderKeyHint(t("key.choose_topic"), mdiThermometer);
        const v = shownValue(this.payload(s.stateTopic), s.field, s.decimals);
        const toggled = s.pressAction === "toggle" && s.pressStateTopic?.trim() ? this.toggle.state(inst.id, toggleTopics(s)) : undefined;
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
            frame: toggled === "on" ? s.pressColor || ACCENT : undefined,
        });
    }
}

function toggleTopics(s: ValueKeySettings): SwitchTopics {
    return {
        stateTopic: s.pressStateTopic,
        commandTopic: s.pressCommandTopic,
        field: s.pressField,
        onValue: s.pressOnValue,
        offValue: s.pressOffValue,
        commandOn: s.pressCommandOn,
        commandOff: s.pressCommandOff,
        template: s.pressTemplate,
    };
}
