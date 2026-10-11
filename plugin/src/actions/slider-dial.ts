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
    type DialUpEvent,
    type DidReceiveSettingsEvent,
    SingletonAction,
    type TouchTapEvent,
    type WillAppearEvent,
    type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { isFeedbackPlaying, LatestSender, ListController, OptimisticStore, playFeedback, rowStateFromSettings } from "@rocklobster42195/streamdeck-kit";
import { mdiPath } from "@rocklobster42195/streamdeck-kit/mdi";
import { mdiKnob } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { ha } from "../ha/connection";
import { haDial, modeCall, nextMode, type HaDial } from "../ha/dial";
import { Accelerator } from "../ha/acceleration";
import { DialMode } from "../ha/dial-mode";
import { activeEffect, effectCall, effectList, isSnapshot, levelCall, levelSpec, lightColor, lightHs, lightInfo, lightLevels, lightSnapshot, snapshotCall, type HaCall, type LightLevel } from "../ha/light";
import { haEffectColor, haEffectNumber, noEffectColor } from "../ha/effect-inputs";
import { panorama, panoramaRows } from "../bus/hac-bus";
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
        /** Empty: the open ring (HA's style). */
        look?: "open" | "half" | "ring" | "pie";
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
        /** The row's Panorama as this dial stored it, and whether the dial shows it (see the kit's panorama/rows.ts). */
        panorama?: JsonObject;
        panoramaMember?: boolean;
        /** Before rows: "auto", "none" or an effect id (taken over once). */
        background?: string;
        /** Before the colour field: false = no colour from the dial's own light. */
        effectLightColor?: boolean;
        /** HA entity whose colour the effect takes (empty: the dial's own light; "none": no colour), optionally an attribute of it. */
        effectColorEntityId?: string;
        effectColorAttribute?: string;
        /** HA entities whose numbers set the effect's speed and density (range: min/max, else the helper's own, else 0–100). */
        effectSpeedEntityId?: string;
        effectSpeedMin?: string;
        effectSpeedMax?: string;
        effectDensityEntityId?: string;
        effectDensityMin?: string;
        effectDensityMax?: string;
        /** An HA entity whose value (÷ effectLevelMax) moves the effect, like an audio level. */
        effectLevelEntityId?: string;
        effectLevelMax?: string;
        /** A light's ring keeps the fixed colour (or colour ranges) instead of following the lamp's colour. */
        fixedRingColor?: boolean;
        /** A light's preset (a tap recalls it, a long tap saves it); a list so that more can come. */
        presets?: JsonObject[];
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
    /** Where the dial sits (its row is the device's dials). */
    device: string;
    column: number;
    /** A light's settings mode: its levels, and which one is shown. */
    mode: DialMode<LightLevel>;
    levelSender: LatestSender<{ level: LightLevel; value: number }>;
    /** Fast turning moves further per notch: a light's brightness and its colour temperature. */
    brightnessPace: Accelerator;
    kelvinPace: Accelerator;
    /** The effect level's vertical list. */
    effects?: ListController;
    /** The level the effect list was last opened for, to open it once per visit. */
    listed?: LightLevel;
    /** A push that is decided on release (a long one opens the settings mode). */
    push?: { timer: ReturnType<typeof setTimeout>; long: boolean };
};

const CONFIRM_MS = 3000;
const ADJUST_MS = 1500;
/** The largest multiplier of a fast spin: brightness steps 5 % (up to 20 %), colour temperature 100 K (up to 800 K). */
const BRIGHTNESS_PACE = 4;
const KELVIN_PACE = 8;
/** How long a push must last to count as long. */
const LONG_PUSH_MS = 500;
const LEVEL_NAMES: Record<LightLevel, string> = { kelvin: "dial.kelvin", hue: "dial.hue", saturation: "dial.saturation", effect: "dial.effect" };

@action({ UUID: "de.boriskemper.ha-controller.slider" })
export class SliderDial extends SingletonAction<SliderDialSettings> {
    private readonly instances = new Map<string, Instance>();
    private readonly optimistic = new OptimisticStore<{ value: number | undefined }>();
    /** The settings mode's values, per dial and level. */
    private readonly levelValues = new OptimisticStore<{ value: number | undefined }>();
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

    /**
     * What HA puts into the effect (colour, speed, density): live settings, so they win over the
     * picked ones of every dial in the group, also another plugin's.
     */
    private effectLive(inst: Instance): Record<string, unknown> {
        const s = inst.settings;
        const live: Record<string, unknown> = {};
        const colorId = s.effectColorEntityId?.trim();
        if (!noEffectColor(colorId)) {
            // Empty field: the dial's own light (as before the field, unless that was switched off)
            const own = !colorId && this.fromHa(inst) && s.effectLightColor !== false ? s.entityId : undefined;
            const color = haEffectColor(ha.entities[colorId || own || ""], colorId ? s.effectColorAttribute : undefined);
            if (color) Object.assign(live, { color, primaryColor: color });
        }
        const effect = panoramaRows.effectOf(inst.id);
        if (effect) {
            const speed = haEffectNumber(ha.entities[s.effectSpeedEntityId?.trim() ?? ""], effect, "savedSpeed", s.effectSpeedMin, s.effectSpeedMax);
            const density = haEffectNumber(ha.entities[s.effectDensityEntityId?.trim() ?? ""], effect, "savedDensity", s.effectDensityMin, s.effectDensityMax);
            if (speed !== undefined) live.savedSpeed = speed;
            if (density !== undefined) live.savedDensity = density;
        }
        return live;
    }

    /** A level 0..1 from an HA entity (e.g. power ÷ its maximum) that moves the effect, as audio does. */
    private effectLevel(inst: Instance): number | undefined {
        const id = inst.settings.effectLevelEntityId?.trim();
        if (!id) return undefined;
        const value = Number(ha.entities[id]?.state);
        const max = Number(inst.settings.effectLevelMax) || 100;
        return Number.isFinite(value) ? Math.min(1, Math.max(0, value / max)) : undefined;
    }

    /** The Panorama's slice behind the dial, keeping colour, speed, density and level up to date with HA. */
    private background(inst: Instance): string | undefined {
        if (!panoramaRows.effectOf(inst.id)) return undefined;
        // An unchecked dial stays in the row's geometry, but shows nothing and puts nothing in
        if (!panoramaRows.isMember(inst.id)) {
            panorama.updateLive(inst.id, {});
            panorama.setLevel(inst.id, undefined);
            return undefined;
        }
        panorama.updateLive(inst.id, this.effectLive(inst));
        panorama.setLevel(inst.id, this.effectLevel(inst));
        return panorama.isActive(inst.id) ? panorama.renderSlice(inst.id) : undefined;
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
            device: ev.action.device.id,
            column: (ev.payload as { coordinates?: { column: number } }).coordinates?.column ?? 0,
            mode: new DialMode<LightLevel>(() => this.render(inst)),
            levelSender: new LatestSender((v) => this.sendLevel(id, v.level, v.value), 150),
            brightnessPace: new Accelerator(BRIGHTNESS_PACE),
            kelvinPace: new Accelerator(KELVIN_PACE),
        };
        this.instances.set(id, inst);
        this.listen(inst);
        panoramaRows.add(id, {
            device: inst.device,
            column: inst.column,
            label: () => inst.settings.label?.trim() || (this.fromHa(inst) ? haName(ha.entities[inst.settings.entityId ?? ""]) : undefined) || inst.settings.entityId || inst.settings.stateTopic || "",
            state: () => rowStateFromSettings(inst.settings),
            save: (patch) => {
                inst.settings = { ...inst.settings, ...patch } as SliderDialSettings;
                void inst.action.setSettings(inst.settings);
            },
            redraw: () => this.render(inst),
        });
        this.render(inst);
    }

    override onWillDisappear(ev: WillDisappearEvent<SliderDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.timers.forEach(clearTimeout);
        if (inst.push) clearTimeout(inst.push.timer);
        inst.mode.dispose();
        inst.effects?.dispose();
        for (const level of Object.keys(LEVEL_NAMES)) this.levelValues.clear(levelKey(inst.id, level as LightLevel));
        this.toggle.forget(inst.id);
        this.haToggle.forget(inst.id);
        this.optimistic.clear(inst.id);
        panoramaRows.remove(inst.id);
        broker.release(inst.id);
        this.instances.delete(inst.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<SliderDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.settings = ev.payload.settings;
        this.listen(inst);
        panoramaRows.changed(inst.id);
        this.render(inst);
    }

    override onDialRotate(ev: DialRotateEvent<SliderDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        if (this.fromHa(inst) ? ha.state !== "online" || !this.dial(inst) : broker.state !== "online" || !this.commandTopic(inst.settings)) return;
        if (inst.mode.open) return this.rotateLevel(inst, ev.payload.ticks);
        // A light's brightness speeds up when turned fast
        const ticks = this.isLight(inst) ? inst.brightnessPace.apply(ev.payload.ticks) : ev.payload.ticks;
        const value = stepValue(this.setpoint(inst), ticks, this.range(inst.settings, this.dial(inst)));
        this.optimistic.set(inst.id, { value }, CONFIRM_MS);
        inst.sender.push(value);
        inst.adjustingUntil = Date.now() + ADJUST_MS;
        // Redraw when turning counts as over, and when an unconfirmed value runs out
        inst.timers.forEach(clearTimeout);
        inst.timers = [setTimeout(() => this.render(inst), ADJUST_MS + 20), setTimeout(() => this.render(inst), CONFIRM_MS + 50)];
        this.render(inst);
    }

    override onDialDown(ev: DialDownEvent<SliderDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        // A light with levels tells a push from a long push on release; everything else acts at once
        if (!this.hasLevels(inst)) return this.press(inst.id);
        inst.mode.touch();
        if (inst.push) clearTimeout(inst.push.timer);
        const push = { long: false, timer: setTimeout(() => this.longPush(inst), LONG_PUSH_MS) };
        inst.push = push;
    }

    override onDialUp(ev: DialUpEvent<SliderDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        const push = inst?.push;
        if (!inst || !push) return;
        clearTimeout(push.timer);
        inst.push = undefined;
        if (push.long) return;
        if (inst.mode.open) return this.pushLevel(inst);
        this.press(inst.id);
    }

    override onTouchTap(ev: TouchTapEvent<SliderDialSettings>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        // In the settings mode a tap goes back; on a light it recalls the preset, a long tap saves it
        if (inst.mode.open) return inst.mode.back();
        if (this.isLight(inst)) return ev.payload.hold ? this.savePreset(inst) : this.recallPreset(inst);
        this.press(inst.id);
    }

    private isLight(inst: Instance): boolean {
        return this.fromHa(inst) && inst.settings.entityId?.startsWith("light.") === true;
    }

    /** Whether the dial's light has a settings mode (colour temperature, colour or effects). */
    private hasLevels(inst: Instance): boolean {
        return this.isLight(inst) && inst.mode.available.length > 0;
    }

    /** A long push opens the settings mode. */
    private longPush(inst: Instance): void {
        if (!inst.push) return;
        inst.push.long = true;
        if (!inst.mode.open) inst.mode.enter();
    }

    /** A push in the settings mode: the next level; in the effect list it starts the marked effect. */
    private pushLevel(inst: Instance): void {
        if (inst.mode.active === "effect") {
            const effect = effectList(ha.entities[inst.settings.entityId ?? ""])[inst.effects?.marked ?? -1];
            inst.mode.touch();
            if (effect) this.callHa(inst, effectCall(effect));
            return;
        }
        inst.mode.next();
    }

    /** Turn in the settings mode: the active level's value, or the effect list. */
    private rotateLevel(inst: Instance, ticks: number): void {
        inst.mode.touch();
        const level = inst.mode.active;
        if (!level) return;
        if (level === "effect") return inst.effects?.rotate(ticks);
        const e = ha.entities[inst.settings.entityId ?? ""];
        const spec = levelSpec(e, level);
        if (!spec) return;
        // Colour temperature covers thousands of Kelvin, so it speeds up too; hue and saturation stay exact
        const value = stepValue(this.levelValue(inst, level), level === "kelvin" ? inst.kelvinPace.apply(ticks) : ticks, spec);
        this.levelValues.set(levelKey(inst.id, level), { value }, CONFIRM_MS);
        inst.levelSender.push({ level, value });
        inst.timers.forEach(clearTimeout);
        inst.timers = [setTimeout(() => this.render(inst), CONFIRM_MS + 50)];
        this.render(inst);
    }

    /** A level's value: the one just set while unconfirmed, else the reported one. */
    private levelValue(inst: Instance, level: LightLevel): number | undefined {
        const reported = levelSpec(ha.entities[inst.settings.entityId ?? ""], level)?.value;
        return this.levelValues.apply(levelKey(inst.id, level), { value: reported }).value;
    }

    private sendLevel(id: string, level: LightLevel, value: number): Promise<void> {
        const inst = this.instances.get(id);
        if (!inst) return Promise.resolve();
        // Hue and saturation each need the other half of the colour
        const hs: [number, number] = [this.levelValue(inst, "hue") ?? lightHs(ha.entities[inst.settings.entityId ?? ""])?.[0] ?? 0, this.levelValue(inst, "saturation") ?? lightHs(ha.entities[inst.settings.entityId ?? ""])?.[1] ?? 100];
        const call = levelCall(level, value, hs);
        if (!call) return Promise.resolve();
        return this.callHa(inst, call);
    }

    private callHa(inst: Instance, call: HaCall): Promise<void> {
        streamDeck.logger.info(`[ha] ${call.domain}.${call.service} ${inst.settings.entityId} ${JSON.stringify(call.data)}`);
        return ha.call(call.domain, call.service, inst.settings.entityId!, call.data).then((ok) => (ok ? undefined : this.alert(inst)));
    }

    /** Long tap: the lamp's state as it is now becomes the preset. */
    private savePreset(inst: Instance): void {
        const snap = lightSnapshot(ha.entities[inst.settings.entityId ?? ""]);
        if (!snap || ha.state !== "online") return this.alert(inst);
        inst.settings = { ...inst.settings, presets: [snap as unknown as JsonObject] };
        void inst.action.setSettings(inst.settings);
        this.ok(inst);
    }

    /** Tap: the lamp goes back to the preset. */
    private recallPreset(inst: Instance): void {
        const snap = inst.settings.presets?.[0];
        if (!isSnapshot(snap) || ha.state !== "online") return this.alert(inst);
        void this.callHa(inst, snapshotCall(snap));
        this.ok(inst);
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
                void ha.call(call.domain, call.service, e!.entity_id, call.data).then((ok) => (ok ? undefined : this.alert(inst)));
                return;
            }
            if (!d?.toggles) return;
            if (ha.state !== "online" || !this.haToggle.press(id, inst.settings.entityId!)) this.alert(inst);
            this.render(inst);
            return;
        }
        if (broker.state !== "online") return this.alert(inst);
        if (runPress(inst.settings, this.toggle, id, "slider") === "failed") this.alert(inst);
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

    /** The kit's own alert on the touch strip (red with "!") instead of Stream Deck's triangle. */
    private alert(inst: Instance): void {
        playFeedback(inst.id, { setImage: (image?: string) => inst.action.setFeedback({ "full-canvas": image ?? "" }) }, "alert", {
            width: 200,
            height: 100,
            background: "#0a0a0a",
            restore: () => {
                inst.lastImage = undefined;
                this.render(inst);
            },
        });
    }

    /** The kit's check mark on the touch strip (a preset saved or recalled). */
    private ok(inst: Instance): void {
        playFeedback(inst.id, { setImage: (image?: string) => inst.action.setFeedback({ "full-canvas": image ?? "" }) }, "ok", {
            width: 200,
            height: 100,
            background: "#0a0a0a",
            restore: () => {
                inst.lastImage = undefined;
                this.render(inst);
            },
        });
    }

    private render(inst: Instance): void {
        // The alert owns the strip while it plays; the dial redraws when it ends
        if (isFeedbackPlaying(inst.id)) return;
        inst.seen = this.fromHa(inst) ? ha.entities[inst.settings.entityId ?? ""] : undefined;
        inst.mode.setLevels(this.isLight(inst) ? lightLevels(inst.seen) : []);
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
        if (inst.mode.active !== "effect") inst.listed = undefined;
        if (inst.mode.open) return this.levelImage(inst, e);
        const d = haDial(e);
        const r = this.range(s, d);
        const setpoint = this.setpoint(inst);
        const percent = d?.unit === "%" && r.min === 0 && r.max === 100;
        const off = d?.off === true || (d?.toggles === true && this.haToggle.state(inst.id, s.entityId) === "off");
        // A light's ring wears the lamp's colour, unless a fixed colour or colour ranges are chosen
        const lamp = this.isLight(inst) && !s.fixedRingColor && !s.color?.trim() && !s.thresholds?.length ? lightColor(e) : undefined;
        return renderSliderDial({
            background: this.background(inst),
            look: lookOf(s),
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
            zones: lamp ? [{ from: r.min, color: lamp }] : zonesOf(s.color || "#F7A600", s.thresholds),
            off,
            // A thermostat's mode in HA's words ("Heizen", "Automatisch"); "Aus" shows as off; a light's effect or colour temperature
            status: d?.modes && e && !d.off ? ha.stateText(e) : this.isLight(inst) && !off ? lightInfo(e) : undefined,
            offText: t("key.off"),
            offline: ha.state !== "online" || !e || e.state === "unavailable",
            adjusting: Date.now() < inst.adjustingUntil,
        });
    }

    /** The settings mode: the active level's ring (colour temperature, hue, saturation) or the effect list. */
    private levelImage(inst: Instance, e: HassEntity | undefined): string {
        const s = inst.settings;
        const t = (k: string) => streamDeck.i18n.t(k);
        const level = inst.mode.active!;
        const { index, count } = inst.mode.position;
        const name = t(LEVEL_NAMES[level]);
        if (level === "effect") return this.effectImage(inst, e);
        const spec = levelSpec(e, level);
        const value = this.levelValue(inst, level);
        return renderSliderDial({
            background: this.background(inst),
            look: "open",
            setpoint: value,
            setpointText: value === undefined ? undefined : localNumber(formatNumber(value, spec?.step ?? 1)),
            unit: spec?.unit,
            label: name,
            icon: mdiPath(s.icon) ?? haIconPath(e),
            min: spec?.min ?? 0,
            max: spec?.max ?? 100,
            zones: spec?.zones ?? zonesOf("#F7A600", undefined),
            off: false,
            // Where the level sits among the others, e.g. 2/4
            status: `${index + 1}/${count}`,
            offText: t("key.off"),
            offline: ha.state !== "online" || !e || e.state === "unavailable",
            adjusting: Date.now() < inst.adjustingUntil,
        });
    }

    /** The effect level: the lamp's effects as a vertical list, the running one marked. */
    private effectImage(inst: Instance, e: HassEntity | undefined): string {
        const names = effectList(e);
        const running = activeEffect(e);
        if (!inst.effects) inst.effects = new ListController({ id: inst.id, redraw: () => this.render(inst) });
        // Open the list on the running effect once per visit
        if (inst.listed !== "effect") {
            inst.listed = "effect";
            inst.effects.reset(names.length, Math.max(0, running ? names.indexOf(running) : 0), streamDeck.i18n.t(LEVEL_NAMES.effect));
        } else if (inst.effects.length !== names.length) inst.effects.setLength(names.length);
        return inst.effects.render({
            row: (i) => (names[i] === undefined ? undefined : { title: names[i], active: names[i] === running }),
            accent: "#F7A600",
            showImages: false,
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
            background: this.background(inst),
            look: lookOf(s),
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

function levelKey(id: string, level: LightLevel): string {
    return `${id}:${level}`;
}

/** The chosen look; the open ring when none is chosen. */
function lookOf(s: SliderDialSettings): "open" | "half" | "ring" | "pie" {
    return s.look === "half" || s.look === "ring" || s.look === "pie" ? s.look : "open";
}
