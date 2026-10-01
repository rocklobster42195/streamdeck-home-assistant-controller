// Slider dial: rotate to set a value (brightness, a setpoint, a blind's position); the display
// follows at once and the device gets the latest value at most every 150 ms. With Home Assistant,
// the entity brings range, step and unit (see ha/dial.ts), a thermostat its room temperature, and a
// push switches lights, fans and covers. With MQTT, an actual-value topic makes it a thermostat (the
// arc shows the measured value, a marker the setpoint), and a push runs the press action (switch
// something on and off, or send a payload).
import streamDeck, {
    action,
    type DialAction,
    type DialDownEvent,
    type DialRotateEvent,
    type DidReceiveSettingsEvent,
    SingletonAction,
    type TouchTapEvent,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { LatestSender, OptimisticStore } from "@rocklobster42195/streamdeck-kit";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiKnob } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { ha } from "../ha/connection";
import { haDial, modeCall, nextMode, type HaDial } from "../ha/dial";
import { haName } from "../ha/entities";
import { haIconPath } from "../ha/icons";
import { broker } from "../mqtt/connection";
import { fillTemplate } from "../mqtt/payload";
import { isUnavailable } from "../mqtt/schemes";
import { formatNumber, stepValue, toPercent, type SliderRange } from "../mqtt/slider-state";
import { numberSetting, shownValue, zonesOf } from "../mqtt/value-state";
import { renderSliderDial, renderSliderMessage } from "../render/slider-dial";
import { pressListenTopic, pressState, runPress, type PressSettings } from "./press-action";
import { HaToggle } from "./ha-toggle";
import { Toggle } from "./toggle";
import { keyLabel, sourceOf, type SourceSettings } from "../source";
import { localNumber } from "../format";
import { syncTopics } from "./topic-key";

export type SliderDialSettings = JsonObject &
    SourceSettings &
    PressSettings & {
        stateTopic?: string;
        field?: string;
        commandTopic?: string;
        /** `{value}` becomes the number, e.g. `{"brightness":{value}}`. */
        template?: string;
        min?: string;
        max?: string;
        step?: string;
        unit?: string;
        /** Decimals on the display; empty: as many as the step needs. */
        decimals?: string;
        look?: "half" | "ring";
        /** Show the value as a percentage of min–max (devices use 0–254, 0–255, 0–100, …). */
        percent?: boolean;
        /** The measured value (a thermostat's room temperature). */
        actualTopic?: string;
        actualField?: string;
        color?: string;
        thresholds?: JsonObject[];
        label?: string;
        icon?: string;
        availabilityTopic?: string;
        retain?: boolean;
        qos?: "0" | "1" | "2";
    };

type Instance = {
    id: string;
    action: DialAction<SliderDialSettings>;
    settings: SliderDialSettings;
    topics: Set<string>;
    sender: LatestSender<number>;
    /** Until when the user counts as turning (the setpoint is shown large). */
    adjustingUntil: number;
    timers: ReturnType<typeof setTimeout>[];
    lastImage?: string;
    /** The HA entity last drawn, to redraw only when it changes. */
    seen?: HassEntity;
};

const CONFIRM_MS = 3000;
const ADJUST_MS = 1500;

@action({ UUID: "de.boriskemper.ha-controller.slider" })
export class SliderDial extends SingletonAction<SliderDialSettings> {
    private readonly instances = new Map<string, Instance>();
    private readonly optimistic = new OptimisticStore<{ value: number | undefined }>();
    private readonly toggle = new Toggle((id) => this.redraw(id));
    private readonly haToggle = new HaToggle((id) => this.redraw(id));

    constructor() {
        super();
        broker.onState(() => {
            for (const inst of this.instances.values()) this.render(inst);
        });
        broker.onMessage((topic) => {
            for (const inst of this.instances.values()) if (inst.topics.has(topic)) this.render(inst);
        });
        ha.onState(() => {
            for (const inst of this.instances.values()) this.render(inst);
        });
        ha.onIcons(() => {
            for (const inst of this.instances.values()) this.render(inst);
        });
        ha.onEntities((entities) => {
            for (const inst of this.instances.values()) if (this.fromHa(inst) && entities[inst.settings.entityId ?? ""] !== inst.seen) this.render(inst);
        });
    }

    private fromHa(inst: Instance): boolean {
        return sourceOf(inst.settings, ha.state !== "unconfigured") === "ha";
    }

    /** What the dial does with the key's HA entity; undefined for MQTT dials and unknown entities. */
    private dial(inst: Instance): HaDial | undefined {
        return this.fromHa(inst) ? haDial(ha.entities[inst.settings.entityId ?? ""]) : undefined;
    }

    override onWillAppear(ev: WillAppearEvent<SliderDialSettings>): void {
        if (!ev.action.isDial()) return;
        const id = ev.action.id;
        const inst: Instance = {
            id,
            action: ev.action,
            settings: ev.payload.settings,
            topics: new Set(),
            sender: new LatestSender((v) => this.send(id, v), 150),
            adjustingUntil: 0,
            timers: [],
        };
        this.instances.set(id, inst);
        this.listen(inst);
        this.render(inst);
    }

    override onWillDisappear(ev: WillDisappearEvent<SliderDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.timers.forEach(clearTimeout);
        this.toggle.forget(inst.id);
        this.haToggle.forget(inst.id);
        this.optimistic.clear(inst.id);
        broker.release(inst.id);
        this.instances.delete(inst.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<SliderDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.settings = ev.payload.settings;
        this.listen(inst);
        this.render(inst);
    }

    override onDialRotate(ev: DialRotateEvent<SliderDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        if (this.fromHa(inst) ? ha.state !== "online" || !this.dial(inst) : broker.state !== "online" || !this.commandTopic(inst.settings)) return;
        const value = stepValue(this.setpoint(inst), ev.payload.ticks, this.range(inst.settings, this.dial(inst)));
        this.optimistic.set(inst.id, { value }, CONFIRM_MS);
        inst.sender.push(value);
        inst.adjustingUntil = Date.now() + ADJUST_MS;
        // Redraw when turning counts as over, and when an unconfirmed value runs out
        inst.timers.forEach(clearTimeout);
        inst.timers = [setTimeout(() => this.render(inst), ADJUST_MS + 20), setTimeout(() => this.render(inst), CONFIRM_MS + 50)];
        this.render(inst);
    }

    override onDialDown(ev: DialDownEvent<SliderDialSettings>): void {
        this.press(ev.action.id);
    }

    override onTouchTap(ev: TouchTapEvent<SliderDialSettings>): void {
        this.press(ev.action.id);
    }

    private press(id: string): void {
        const inst = this.instances.get(id);
        if (!inst) return;
        if (this.fromHa(inst)) {
            // Lights, fans and covers switch on and off, a thermostat steps through its modes
            const d = this.dial(inst);
            const e = ha.entities[inst.settings.entityId ?? ""];
            const mode = d?.modes && e ? nextMode(d.modes, e.state) : undefined;
            if (mode) {
                const call = modeCall(mode);
                streamDeck.logger.info(`[ha] ${call.domain}.${call.service} ${e!.entity_id} ${mode}`);
                void ha.call(call.domain, call.service, e!.entity_id, call.data).then((ok) => void (ok ? undefined : inst.action.showAlert()));
                return;
            }
            if (!d?.toggles) return;
            if (ha.state !== "online" || !this.haToggle.press(id, inst.settings.entityId!)) void inst.action.showAlert();
            this.render(inst);
            return;
        }
        if (broker.state !== "online") return void inst.action.showAlert();
        if (runPress(inst.settings, this.toggle, id, "slider") === "failed") void inst.action.showAlert();
        this.render(inst);
    }

    private send(id: string, value: number): Promise<void> {
        const inst = this.instances.get(id);
        const d = inst && this.dial(inst);
        if (inst && d) {
            const call = d.set(value);
            streamDeck.logger.info(`[ha] ${call.domain}.${call.service} ${inst.settings.entityId} ${JSON.stringify(call.data)}`);
            return ha.call(call.domain, call.service, inst.settings.entityId!, call.data).then(() => undefined);
        }
        const topic = inst && this.commandTopic(inst.settings);
        if (!inst || !topic) return Promise.resolve();
        const s = inst.settings;
        const payload = fillTemplate(s.template, formatNumber(value, this.range(s).step));
        broker.publish(topic, payload, { retain: s.retain, qos: Number(s.qos ?? 0) as 0 | 1 | 2 });
        streamDeck.logger.info(`[slider] ${topic} ← ${payload}`);
        return Promise.resolve();
    }

    private commandTopic(s: SliderDialSettings): string | undefined {
        return s.commandTopic?.trim() || s.stateTopic?.trim() || undefined;
    }

    private range(s: SliderDialSettings, d?: HaDial): SliderRange {
        // HA brings range and step; an own step still wins (e.g. 1 % instead of 5 %)
        if (d) return { min: d.min, max: d.max > d.min ? d.max : d.min + 1, step: numberSetting(s.step, d.step) };
        const min = numberSetting(s.min, 0);
        const max = numberSetting(s.max, 100);
        return { min, max: max > min ? max : min + 1, step: numberSetting(s.step, 1) };
    }

    /** The setpoint: the one just set while unconfirmed, else the reported one. */
    private setpoint(inst: Instance): number | undefined {
        const s = inst.settings;
        const reported = this.fromHa(inst) ? this.dial(inst)?.value : shownValue(this.payload(s.stateTopic), s.field).number;
        return this.optimistic.apply(inst.id, { value: reported }).value;
    }

    private payload(topic: string | undefined): string | undefined {
        return topic?.trim() ? broker.value(topic.trim())?.payload : undefined;
    }

    private listen(inst: Instance): void {
        const s = inst.settings;
        inst.topics = syncTopics(inst.id, inst.topics, this.fromHa(inst) ? [] : [s.stateTopic, s.actualTopic, s.availabilityTopic, pressListenTopic(s)]);
    }

    private redraw(id: string): void {
        const inst = this.instances.get(id);
        if (inst) this.render(inst);
    }

    private render(inst: Instance): void {
        inst.seen = this.fromHa(inst) ? ha.entities[inst.settings.entityId ?? ""] : undefined;
        const image = this.image(inst);
        if (image === inst.lastImage) return;
        inst.lastImage = image;
        void inst.action.setFeedback({ "full-canvas": image }).catch((e) => streamDeck.logger.warn("[slider] setFeedback failed", e));
    }

    /** The dial on an HA entity: range, unit and room temperature from HA, off while it is off. */
    private haImage(inst: Instance): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        if (ha.state === "unconfigured" || ha.state === "invalid") return renderSliderMessage(mdiKnob, t("key.no_ha"), true);
        if (!s.entityId?.trim()) return renderSliderMessage(mdiKnob, t("key.choose_device"), false);
        const e = ha.entities[s.entityId];
        const d = haDial(e);
        const r = this.range(s, d);
        const setpoint = this.setpoint(inst);
        const percent = d?.unit === "%" && r.min === 0 && r.max === 100;
        return renderSliderDial({
            look: s.look === "ring" ? "ring" : "half",
            setpoint,
            setpointText: setpoint === undefined ? undefined : localNumber(formatNumber(setpoint, r.step, s.decimals)),
            actual: d?.actual,
            actualText: d?.actual === undefined ? undefined : localNumber(formatNumber(d.actual, 0.1, s.decimals)),
            unit: s.unit?.trim() || d?.unit || (d?.actual !== undefined || e?.entity_id.startsWith("climate.") ? "°C" : undefined),
            label: keyLabel(s, haName(e)),
            icon: mdiPath(s.icon) ?? haIconPath(e),
            min: r.min,
            max: r.max,
            rangeLabels: percent ? ["0", "100"] : undefined,
            zones: zonesOf(s.color || "#F7A600", s.thresholds),
            off: d?.off === true || (d?.toggles === true && this.haToggle.state(inst.id, s.entityId) === "off"),
            // A thermostat's mode in HA's words ("Heizen", "Automatisch"); "Aus" shows as off
            status: d?.modes && e && !d.off ? ha.stateText(e) : undefined,
            offText: t("key.off"),
            offline: ha.state !== "online" || !e || e.state === "unavailable",
            adjusting: Date.now() < inst.adjustingUntil,
        });
    }

    private image(inst: Instance): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        if (this.fromHa(inst)) return this.haImage(inst);
        const r = this.range(s);
        const setpoint = this.setpoint(inst);
        const actual = s.actualTopic?.trim() ? shownValue(this.payload(s.actualTopic), s.actualField, s.decimals) : undefined;
        const avail = s.availabilityTopic?.trim();
        if (broker.state === "unconfigured" || broker.state === "invalid") return renderSliderMessage(mdiKnob, t("key.no_broker"), true);
        if (!this.commandTopic(s)) return renderSliderMessage(mdiKnob, t("key.choose_topic"), false);
        return renderSliderDial({
            look: s.look === "ring" ? "ring" : "half",
            setpoint,
            setpointText: setpoint === undefined ? undefined : s.percent ? String(toPercent(setpoint, r)) : localNumber(formatNumber(setpoint, r.step, s.decimals)),
            actual: actual?.number,
            actualText: actual?.text,
            unit: s.percent ? "%" : s.unit,
            label: keyLabel(s),
            icon: mdiPath(s.icon),
            min: r.min,
            max: r.max,
            rangeLabels: s.percent ? ["0", "100"] : undefined,
            zones: zonesOf(s.color || "#F7A600", s.thresholds),
            off: pressState(s, this.toggle, inst.id) === "off",
            offText: t("key.off"),
            offline: broker.state !== "online" || (!!avail && isUnavailable(broker.value(avail)?.payload)),
            adjusting: Date.now() < inst.adjustingUntil,
        });
    }
}
