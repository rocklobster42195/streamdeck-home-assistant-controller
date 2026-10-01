// Multi-state key: steps through a list of values (fan off → 1 → 2 → 3, a mode, a scene list)
// and shows the current one with its own name, icon and colour: the options of an HA select
// (select_option), or values sent to an MQTT topic. The next state shows at once and goes back if
// the device doesn't confirm within 3 s.
import streamDeck, { action } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { OptimisticStore } from "@rocklobster42195/streamdeck-kit";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiFan, mdiFormatListNumbered } from "@mdi/js";
import { ha } from "../ha/connection";
import { haName, haSelectService } from "../ha/entities";
import { haIconPath } from "../ha/icons";
import { broker } from "../mqtt/connection";
import { nextIndex, stateCommand, stateIndex, stateOptions } from "../mqtt/multi-state";
import { readValue } from "../mqtt/payload";
import { ACCENT } from "../render/svg";
import { renderMultiStateKey } from "../render/multi-state-key";
import { renderKeyHint } from "../render/switch-key";
import { TopicKey, type KeyInstance, type TopicKeySettings } from "./topic-key";

export type MultiStateKeySettings = TopicKeySettings & {
    stateTopic?: string;
    commandTopic?: string;
    field?: string;
    template?: string;
    /** [{ value, label?, icon?, color? }] */
    states?: JsonObject[];
    retain?: boolean;
    qos?: "0" | "1" | "2";
    label?: string;
};

const CONFIRM_MS = 3000;

@action({ UUID: "de.boriskemper.ha-controller.multi-state" })
export class MultiStateKey extends TopicKey<MultiStateKeySettings> {
    private readonly optimistic = new OptimisticStore<{ index: number }>();
    private readonly revertTimers = new Map<string, ReturnType<typeof setTimeout>>();
    /** Keys without a state topic step by what they sent last. */
    private readonly sent = new Map<string, number>();

    protected override readonly haCapable = true;

    constructor() {
        super("multi-state");
    }

    protected override topicsOf(s: MultiStateKeySettings): (string | undefined)[] {
        return [s.stateTopic];
    }

    private reported(inst: KeyInstance<MultiStateKeySettings>): number {
        const s = inst.settings;
        if (this.source(inst) === "ha") return stateIndex(stateOptions(s.states), this.entity(inst)?.state);
        if (!s.stateTopic?.trim()) return this.sent.get(inst.id) ?? -1;
        return stateIndex(stateOptions(s.states), this.payload(s.stateTopic), s.field);
    }

    private current(inst: KeyInstance<MultiStateKeySettings>): number {
        return this.optimistic.apply(inst.id, { index: this.reported(inst) }).index;
    }

    protected override press(inst: KeyInstance<MultiStateKeySettings>): void {
        const s = inst.settings;
        const options = stateOptions(s.states);
        const next = nextIndex(this.current(inst), options.length);
        const fromHa = this.source(inst) === "ha";
        if (fromHa) {
            const call = next >= 0 && s.entityId ? haSelectService(s.entityId, options[next].value) : undefined;
            if (!call) return void inst.action.showAlert();
            streamDeck.logger.info(`[ha] ${call.domain}.${call.service} ${s.entityId} ${call.data.option}`);
            void ha.call(call.domain, call.service, s.entityId!, call.data).then((ok) => {
                if (ok) return;
                this.optimistic.clear(inst.id);
                this.render(inst);
                void inst.action.showAlert();
            });
        } else {
            const cmd = next >= 0 ? stateCommand(s, options[next]) : undefined;
            if (!cmd) return void inst.action.showAlert();
            broker.publish(cmd.topic, cmd.payload, { retain: s.retain, qos: Number(s.qos ?? 0) as 0 | 1 | 2 });
            streamDeck.logger.info(`[multi-state] ${cmd.topic} ← ${cmd.payload}`);
        }
        if (!fromHa && !s.stateTopic?.trim()) this.sent.set(inst.id, next);
        else {
            this.optimistic.set(inst.id, { index: next }, CONFIRM_MS);
            clearTimeout(this.revertTimers.get(inst.id));
            this.revertTimers.set(
                inst.id,
                setTimeout(() => this.render(inst), CONFIRM_MS + 50),
            );
        }
        this.render(inst);
    }

    protected override disappeared(inst: KeyInstance<MultiStateKeySettings>): void {
        clearTimeout(this.revertTimers.get(inst.id));
        this.revertTimers.delete(inst.id);
        this.optimistic.clear(inst.id);
        this.sent.delete(inst.id);
    }

    protected override image(inst: KeyInstance<MultiStateKeySettings>): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        const hint = this.sourceHint(inst, mdiFan);
        if (hint) return hint;
        const fromHa = this.source(inst) === "ha";
        const options = stateOptions(s.states);
        if (!fromHa && !s.stateTopic?.trim() && !s.commandTopic?.trim()) return renderKeyHint(t("key.choose_topic"), mdiFormatListNumbered);
        if (!options.length) return renderKeyHint(t("key.add_states"), mdiFormatListNumbered);
        const index = this.current(inst);
        const o = index >= 0 ? options[index] : undefined;
        return renderMultiStateKey({
            index,
            count: options.length,
            icon: mdiPath(o?.icon) ?? mdiPath(options.find((x) => x.icon)?.icon) ?? (fromHa ? haIconPath(this.entity(inst)) : undefined) ?? mdiFan,
            color: o?.color || ACCENT,
            text: o ? o.label?.trim() || o.value : s.label?.trim() || readable(fromHa ? this.entity(inst)?.state : readValue(this.payload(s.stateTopic), s.field)) || (fromHa ? haName(this.entity(inst)) : undefined),
            offline: this.isOffline(inst),
        });
    }
}

/** An unknown reported value, short enough for the key. */
function readable(value: string | undefined): string | undefined {
    const p = value?.trim();
    return p && p.length <= 24 && !p.startsWith("{") ? p : undefined;
}
