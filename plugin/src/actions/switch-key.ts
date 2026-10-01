// Switch key: toggles a device between two values (ON/OFF, true/false, …) and shows its state.
// After a press the new state shows at once and goes back if the device doesn't confirm in 3 s.
import streamDeck, { action } from "@elgato/streamdeck";
import { OptimisticStore } from "@rocklobster42195/streamdeck-kit";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiLightbulbOnOutline, mdiLightbulbOutline, mdiToggleSwitchOffOutline } from "@mdi/js";
import { broker } from "../mqtt/connection";
import { switchCommand, switchState, type SwitchState, type SwitchTopics } from "../mqtt/switch-state";
import { ACCENT } from "../render/svg";
import { renderKeyHint, renderSwitchKey } from "../render/switch-key";
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
    };

const CONFIRM_MS = 3000;

@action({ UUID: "de.boriskemper.mqtt-controller.switch" })
export class SwitchKey extends TopicKey<SwitchKeySettings> {
    private readonly optimistic = new OptimisticStore<{ state: SwitchState }>();
    private readonly revertTimers = new Map<string, ReturnType<typeof setTimeout>>();
    /** Keys without a state topic toggle by what they sent last. */
    private readonly sent = new Map<string, boolean>();

    constructor() {
        super("switch");
    }

    protected override topicsOf(s: SwitchKeySettings): (string | undefined)[] {
        return [s.stateTopic];
    }

    /** The state as the device reports it (without the optimistic one); without a state topic, what was sent last. */
    private reported(inst: KeyInstance<SwitchKeySettings>): SwitchState {
        if (!inst.settings.stateTopic?.trim()) return this.sent.get(inst.id) ? "on" : "off";
        return switchState(inst.settings, this.payload(inst.settings.stateTopic));
    }

    protected override press(inst: KeyInstance<SwitchKeySettings>): void {
        const s = inst.settings;
        const shown = this.optimistic.apply(inst.id, { state: this.reported(inst) }).state;
        const turnOn = shown !== "on";
        const cmd = switchCommand(s, turnOn, this.payload(s.stateTopic));
        if (!cmd) {
            void inst.action.showAlert();
            return;
        }
        broker.publish(cmd.topic, cmd.payload, { retain: s.retain, qos: Number(s.qos ?? 0) as 0 | 1 | 2 });
        streamDeck.logger.info(`[switch] ${cmd.topic} ← ${cmd.payload}`);
        // Without a state topic there is nothing to confirm: keep showing what was sent
        if (!s.stateTopic?.trim()) {
            this.sent.set(inst.id, turnOn);
            this.render(inst);
            return;
        }
        this.optimistic.set(inst.id, { state: turnOn ? "on" : "off" }, CONFIRM_MS);
        clearTimeout(this.revertTimers.get(inst.id));
        this.revertTimers.set(
            inst.id,
            setTimeout(() => this.render(inst), CONFIRM_MS + 50),
        );
        this.render(inst);
    }

    protected override disappeared(inst: KeyInstance<SwitchKeySettings>): void {
        clearTimeout(this.revertTimers.get(inst.id));
        this.revertTimers.delete(inst.id);
        this.optimistic.clear(inst.id);
        this.sent.delete(inst.id);
    }

    protected override image(inst: KeyInstance<SwitchKeySettings>): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        if (broker.state === "unconfigured" || broker.state === "invalid") return renderKeyHint(t("key.no_broker"), mdiLightbulbOnOutline, true);
        if (!s.stateTopic?.trim() && !s.commandTopic?.trim()) return renderKeyHint(t("key.choose_topic"), mdiToggleSwitchOffOutline);
        const state = this.optimistic.apply(inst.id, { state: this.reported(inst) }).state;
        return renderSwitchKey({
            state,
            offline: this.isOffline(inst),
            iconOn: mdiPath(s.iconOn) ?? mdiLightbulbOnOutline,
            iconOff: mdiPath(s.iconOff) ?? mdiPath(s.iconOn) ?? mdiLightbulbOutline,
            colorOn: s.colorOn || ACCENT,
            label: s.label,
        });
    }
}
