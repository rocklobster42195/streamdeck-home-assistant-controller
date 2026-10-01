// Switch key: toggles a device and shows its state: a Home Assistant entity (light, switch, lock,
// cover, …) or MQTT topics with two values (ON/OFF, true/false, …). Optionally a value line under
// the icon (e.g. the plug's power or the light's brightness: an HA attribute or entity, or a topic)
// whose colour ranges can colour the icon while on.
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { zoneColor } from "@rocklobster42195/streamdeck-kit";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiLightbulbOnOutline, mdiLightbulbOutline, mdiToggleSwitchOffOutline } from "@mdi/js";
import { ha } from "../ha/connection";
import { haName, haOnOffStates } from "../ha/entities";
import { haIconPath } from "../ha/icons";
import type { SwitchTopics } from "../mqtt/switch-state";
import { shownValue, zonesOf } from "../mqtt/value-state";
import { ACCENT } from "../render/svg";
import { renderKeyHint, renderSwitchKey } from "../render/switch-key";
import { HaToggle } from "./ha-toggle";
import { Toggle } from "./toggle";
import { keyLabel } from "../source";
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
        /** HA value line: an entity (empty: the key's own) and attribute (empty: its state). */
        valueEntityId?: string;
        valueAttribute?: string;
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

    protected override moreEntities(s: SwitchKeySettings): (string | undefined)[] {
        return [s.valueEntityId];
    }

    /** The value line: shown value and unit, from HA or a topic; undefined when none is set up. */
    private valueLine(inst: KeyInstance<SwitchKeySettings>, fromHa: boolean): { text?: string; number?: number; unit?: string } | undefined {
        const s = inst.settings;
        if (fromHa) {
            if (!s.valueEntityId?.trim() && !s.valueAttribute?.trim()) return undefined;
            const read = ha.read(ha.entities[s.valueEntityId?.trim() || s.entityId || ""], s.valueAttribute);
            return { ...shownValue(read.payload, undefined, s.valueDecimals), unit: s.valueUnit?.trim() || read.unit };
        }
        if (!s.valueTopic?.trim()) return undefined;
        return { ...shownValue(this.payload(s.valueTopic), s.valueField, s.valueDecimals), unit: s.valueUnit?.trim() };
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
        const fromHa = this.source(inst) === "ha";
        if (!fromHa && !s.stateTopic?.trim() && !s.commandTopic?.trim()) return renderKeyHint(t("key.choose_topic"), mdiToggleSwitchOffOutline);
        const e = fromHa ? this.entity(inst) : undefined;
        const value = this.valueLine(inst, fromHa);
        // The on colour follows the value's range, with the chosen on colour as the base
        const base = s.colorOn || ACCENT;
        const colorOn = value?.number !== undefined && s.valueThresholds?.length ? zoneColor(value.number, zonesOf(base, s.valueThresholds)) : base;
        // Lights keep the bulb that lights up; other domains get HA's icon for on and for off
        const states = fromHa ? haOnOffStates(s.entityId ?? "") : undefined;
        const haOn = fromHa ? haIconPath(e, ["light"], states?.on) : undefined;
        const haOff = fromHa ? haIconPath(e, ["light"], states?.off) : undefined;
        return renderSwitchKey({
            state: fromHa ? this.haToggle.state(inst.id, s.entityId!) : this.toggle.state(inst.id, s),
            offline: this.isOffline(inst),
            iconOn: mdiPath(s.iconOn) ?? haOn ?? mdiLightbulbOnOutline,
            iconOff: mdiPath(s.iconOff) ?? mdiPath(s.iconOn) ?? haOff ?? mdiLightbulbOutline,
            colorOn,
            label: keyLabel(s, fromHa ? haName(e) : undefined),
            value: value ? `${value.text ?? "–"}${value.unit ? ` ${value.unit}` : ""}` : undefined,
        });
    }
}
