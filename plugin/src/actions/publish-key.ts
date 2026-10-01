// Trigger key (UUID …publish, formerly "Publish"): runs something once on every press: an HA scene, script, button or automation, or a
// fixed MQTT payload (a scene, opening a gate, a JSON command). With "confirm", the first press arms
// the key for 3 s and only a second press sends.
import streamDeck, { action } from "@elgato/streamdeck";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiGestureTapButton, mdiSend } from "@mdi/js";
import { ha } from "../ha/connection";
import { haName, haTriggerService } from "../ha/entities";
import { haIconPath } from "../ha/icons";
import { broker } from "../mqtt/connection";
import { ACCENT } from "../render/svg";
import { renderPublishKey } from "../render/publish-key";
import { renderKeyHint } from "../render/switch-key";
import { keyLabel } from "../source";
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

    protected override readonly haCapable = true;

    constructor() {
        super("publish");
    }

    protected override topicsOf(): (string | undefined)[] {
        return [];
    }

    protected override press(inst: KeyInstance<PublishKeySettings>): void {
        const s = inst.settings;
        const fromHa = this.source(inst) === "ha";
        const topic = s.topic?.trim();
        const call = fromHa ? haTriggerService(s.entityId ?? "") : undefined;
        if (fromHa ? !call : !topic) return this.feedback(inst, "alert");
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
        this.render(inst);
        if (call) {
            streamDeck.logger.info(`[ha] ${call.domain}.${call.service} ${s.entityId}`);
            void ha.call(call.domain, call.service, s.entityId!).then((ok) => this.feedback(inst, ok ? "ok" : "alert", s.color || ACCENT));
            return;
        }
        if (!broker.publish(topic!, s.payload ?? "", { retain: s.retain, qos: Number(s.qos ?? 0) as 0 | 1 | 2 })) return this.feedback(inst, "alert");
        streamDeck.logger.info(`[publish] ${topic} ← ${s.payload ?? ""}`);
        this.feedback(inst, "ok", s.color || ACCENT);
    }

    protected override disappeared(inst: KeyInstance<PublishKeySettings>): void {
        this.disarm(inst);
    }

    protected override image(inst: KeyInstance<PublishKeySettings>): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        const hint = this.sourceHint(inst, mdiSend);
        if (hint) return hint;
        const fromHa = this.source(inst) === "ha";
        if (!fromHa && !s.topic?.trim()) return renderKeyHint(t("key.choose_topic"), mdiSend);
        const e = fromHa ? this.entity(inst) : undefined;
        return renderPublishKey({
            icon: mdiPath(s.icon) ?? (fromHa ? haIconPath(e) : undefined) ?? mdiGestureTapButton,
            color: s.color || ACCENT,
            label: keyLabel(s, fromHa ? haName(e) : undefined),
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
