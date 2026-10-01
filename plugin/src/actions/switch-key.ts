// Switch key: toggles a device and shows its state: a Home Assistant entity (light, switch, lock,
// cover, …) or MQTT topics with two values (ON/OFF, true/false, …). With MQTT, optionally a value
// line under the icon (e.g. the plug's power) whose colour ranges can colour the icon while on.
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { zoneColor } from "@rocklobster42195/streamdeck-kit";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiLightbulbOnOutline, mdiLightbulbOutline, mdiToggleSwitchOffOutline } from "@mdi/js";
import { haIcon, haName } from "../ha/entities";
import type { SwitchTopics } from "../mqtt/switch-state";
import { shownValue, zonesOf } from "../mqtt/value-state";
import { ACCENT } from "../render/svg";
import { renderKeyHint, renderSwitchKey } from "../render/switch-key";
import { HaToggle } from "./ha-toggle";
import { Toggle } from "./toggle";
import { TopicKey, type KeyInstance, type TopicKeySettings } from "./topic-key";

export type SwitchKeySettings = TopicKeySettings &
    SwitchTopics & {
        retain?: boolean;
        qos?: "0" | "1" | "2";
        /** MDI icon names ("mdiLightbulbOn"). */
        iconOn?: string;
        iconOff?: string;
        colorOn?: string;
        label?: string;
        /** Optional value line under the icon (e.g. the power). */
        valueTopic?: string;
        valueField?: string;
        valueUnit?: string;
        valueDecimals?: string;
        /** Colour ranges for the value: while on, the icon takes the colour of the value's range. */
        valueThresholds?: JsonObject[];
    };

@action({ UUID: "de.boriskemper.ha-controller.switch" })
export class SwitchKey extends TopicKey<SwitchKeySettings> {
    private readonly toggle = new Toggle((id) => this.redraw(id));
    private readonly haToggle = new HaToggle((id) => this.redraw(id));

    protected override readonly haCapable = true;

    constructor() {
        super("switch");
    }

    protected override topicsOf(s: SwitchKeySettings): (string | undefined)[] {
        return [s.stateTopic, s.valueTopic];
    }

    private redraw(id: string): void {
        const inst = this.instances.get(id);
        if (inst) this.render(inst);
    }

    protected override press(inst: KeyInstance<SwitchKeySettings>): void {
        const s = inst.settings;
        if (this.source(inst) === "ha") {
            if (!s.entityId || !this.haToggle.press(inst.id, s.entityId)) void inst.action.showAlert();
            this.render(inst);
            return;
        }
        if (!this.toggle.press(inst.id, s, { retain: s.retain, qos: Number(s.qos ?? 0) as 0 | 1 | 2 })) {
            void inst.action.showAlert();
            return;
        }
        this.render(inst);
    }

    protected override disappeared(inst: KeyInstance<SwitchKeySettings>): void {
        this.toggle.forget(inst.id);
        this.haToggle.forget(inst.id);
    }

    protected override image(inst: KeyInstance<SwitchKeySettings>): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        const hint = this.sourceHint(inst, mdiLightbulbOnOutline);
        if (hint) return hint;
        if (this.source(inst) === "ha") {
            const e = this.entity(inst);
            const icon = mdiPath(s.iconOn) ?? mdiPath(haIcon(e)) ?? mdiLightbulbOnOutline;
            return renderSwitchKey({
                state: this.haToggle.state(inst.id, s.entityId!),
                offline: this.isOffline(inst),
                iconOn: icon,
                iconOff: mdiPath(s.iconOff) ?? mdiPath(s.iconOn) ?? mdiPath(haIcon(e)) ?? mdiLightbulbOutline,
                colorOn: s.colorOn || ACCENT,
                label: s.label?.trim() || haName(e),
            });
        }
        if (!s.stateTopic?.trim() && !s.commandTopic?.trim()) return renderKeyHint(t("key.choose_topic"), mdiToggleSwitchOffOutline);
        const value = s.valueTopic?.trim() ? shownValue(this.payload(s.valueTopic), s.valueField, s.valueDecimals) : undefined;
        // The on colour follows the value's range, with the chosen on colour as the base
        const base = s.colorOn || ACCENT;
        const colorOn = value?.number !== undefined && s.valueThresholds?.length ? zoneColor(value.number, zonesOf(base, s.valueThresholds)) : base;
        return renderSwitchKey({
            state: this.toggle.state(inst.id, s),
            offline: this.isOffline(inst),
            iconOn: mdiPath(s.iconOn) ?? mdiLightbulbOnOutline,
            iconOff: mdiPath(s.iconOff) ?? mdiPath(s.iconOn) ?? mdiLightbulbOutline,
            colorOn,
            label: s.label,
            value: value ? `${value.text ?? "–"}${s.valueUnit?.trim() ? ` ${s.valueUnit.trim()}` : ""}` : undefined,
        });
    }
}
