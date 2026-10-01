// Publish key: sends a fixed payload (a scene, opening a gate, a JSON command) on every press.
// With "confirm", the first press arms the key for 3 s and only a second press sends.
import streamDeck, { action } from "@elgato/streamdeck";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiGestureTapButton, mdiSend } from "@mdi/js";
import { broker } from "../mqtt/connection";
import { ACCENT } from "../render/svg";
import { renderPublishKey } from "../render/publish-key";
import { renderKeyHint } from "../render/switch-key";
import { TopicKey, type KeyInstance, type TopicKeySettings } from "./topic-key";

export type PublishKeySettings = TopicKeySettings & {
    topic?: string;
    payload?: string;
    retain?: boolean;
    qos?: "0" | "1" | "2";
    /** Ask for a second press before sending (a gate, an alarm). */
    confirm?: boolean;
    icon?: string;
    color?: string;
    label?: string;
};

const ARM_MS = 3000;

@action({ UUID: "de.boriskemper.ha-controller.publish" })
export class PublishKey extends TopicKey<PublishKeySettings> {
    /** Keys waiting for the confirming press, with the timer that disarms them. */
    private readonly armed = new Map<string, ReturnType<typeof setTimeout>>();

    constructor() {
        super("publish");
    }

    protected override topicsOf(): (string | undefined)[] {
        return [];
    }

    protected override press(inst: KeyInstance<PublishKeySettings>): void {
        const s = inst.settings;
        const topic = s.topic?.trim();
        if (!topic) return void inst.action.showAlert();
        if (s.confirm && !this.armed.has(inst.id)) {
            this.armed.set(
                inst.id,
                setTimeout(() => {
                    this.armed.delete(inst.id);
                    this.render(inst);
                }, ARM_MS),
            );
            this.render(inst);
            return;
        }
        this.disarm(inst);
        if (!broker.publish(topic, s.payload ?? "", { retain: s.retain, qos: Number(s.qos ?? 0) as 0 | 1 | 2 })) return void inst.action.showAlert();
        streamDeck.logger.info(`[publish] ${topic} ← ${s.payload ?? ""}`);
        this.render(inst);
        void inst.action.showOk();
    }

    protected override disappeared(inst: KeyInstance<PublishKeySettings>): void {
        this.disarm(inst);
    }

    protected override image(inst: KeyInstance<PublishKeySettings>): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        if (broker.state === "unconfigured" || broker.state === "invalid") return renderKeyHint(t("key.no_broker"), mdiSend, true);
        if (!s.topic?.trim()) return renderKeyHint(t("key.choose_topic"), mdiSend);
        return renderPublishKey({
            icon: mdiPath(s.icon) ?? mdiGestureTapButton,
            color: s.color || ACCENT,
            label: s.label,
            armed: this.armed.has(inst.id),
            armedText: t("key.press_again"),
            offline: this.isOffline(inst),
        });
    }

    private disarm(inst: KeyInstance<PublishKeySettings>): void {
        clearTimeout(this.armed.get(inst.id));
        this.armed.delete(inst.id);
    }
}
