// Base for HAC's keys: instances, their source (a Home Assistant entity or MQTT topics), the topics
// each one listens to (subscribed through the shared broker and released when the key goes away),
// a redraw when its entity, one of its topics or a connection changes, and the device's
// availability. Subclasses draw the key and react to a press.
import streamDeck, { type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import type { HassEntity } from "home-assistant-js-websocket";
import { ha } from "../ha/connection";
import { isUnavailable as entityUnavailable } from "../ha/entities";
import { broker } from "../mqtt/connection";
import { isUnavailable } from "../mqtt/schemes";
import { renderKeyHint } from "../render/switch-key";
import { sourceOf, type Source, type SourceSettings } from "../source";

export type TopicKeySettings = SourceSettings & {
    /** Topic that reports whether the device is reachable ("online"/"offline"). */
    availabilityTopic?: string;
} & JsonObject;

export type KeyInstance<S extends JsonObject> = {
    id: string;
    action: KeyAction<S>;
    settings: S;
    topics: Set<string>;
    lastImage?: string;
    /** The HA entities last drawn, to redraw only when one of them changes. */
    seen?: (HassEntity | undefined)[];
};

export abstract class TopicKey<S extends TopicKeySettings> extends SingletonAction<S> {
    protected readonly instances = new Map<string, KeyInstance<S>>();

    constructor(protected readonly name: string) {
        super();
        broker.onState(() => {
            for (const inst of this.instances.values()) this.render(inst);
        });
        ha.onState(() => {
            for (const inst of this.instances.values()) this.render(inst);
        });
        ha.onEntities((entities) => {
            for (const inst of this.instances.values()) {
                const ids = this.entityIds(inst);
                if (ids.some((id, i) => entities[id] !== inst.seen?.[i])) this.render(inst);
            }
        });
        broker.onMessage((topic) => {
            for (const inst of this.instances.values()) if (inst.topics.has(topic)) this.changed(inst, topic);
        });
    }

    /** Topics the key reads (state, availability, …); empty strings are ignored. */
    protected abstract topicsOf(settings: S): (string | undefined)[];
    protected abstract image(inst: KeyInstance<S>): string;
    protected abstract press(inst: KeyInstance<S>): void;
    /** A topic of the key received a message (default: redraw). */
    protected changed(inst: KeyInstance<S>, _topic: string): void {
        this.render(inst);
    }
    protected disappeared(_inst: KeyInstance<S>): void {}

    /** Whether this action can show HA entities yet (so far the Switch, Value, Trigger and Multi-state keys). */
    protected readonly haCapable: boolean = false;

    protected source(inst: KeyInstance<S>): Source {
        return this.haCapable ? sourceOf(inst.settings, ha.state !== "unconfigured") : "mqtt";
    }

    /** The key's HA entity. */
    protected entity(inst: KeyInstance<S>): HassEntity | undefined {
        return ha.entities[inst.settings.entityId ?? ""];
    }

    /** HA entities the key shows besides its own (a second value, a value line). */
    protected moreEntities(_settings: S): (string | undefined)[] {
        return [];
    }

    /** Every HA entity whose change redraws the key (none while the key isn't on HA). */
    private entityIds(inst: KeyInstance<S>): string[] {
        if (!this.haCapable || ha.state === "unconfigured") return [];
        const own = this.source(inst) === "ha" ? [inst.settings.entityId] : [];
        return [...own, ...this.moreEntities(inst.settings)].map((id) => id?.trim()).filter((id): id is string => !!id);
    }

    /** "Set up …" or "Choose a device" while the key's source can't show anything yet. */
    protected sourceHint(inst: KeyInstance<S>, icon: string): string | undefined {
        const t = (k: string) => streamDeck.i18n.t(k);
        if (this.source(inst) === "ha") {
            if (ha.state === "unconfigured" || ha.state === "invalid") return renderKeyHint(t("key.no_ha"), icon, true);
            if (!inst.settings.entityId?.trim()) return renderKeyHint(t("key.choose_device"), icon);
            return undefined;
        }
        if (broker.state === "unconfigured" || broker.state === "invalid") return renderKeyHint(t("key.no_broker"), icon, true);
        return undefined;
    }

    /** The key's source is offline, or the device says it is unavailable. */
    protected isOffline(inst: KeyInstance<S>): boolean {
        if (this.source(inst) === "ha") return ha.state !== "online" || entityUnavailable(this.entity(inst));
        if (broker.state !== "online") return true;
        const avail = inst.settings.availabilityTopic?.trim();
        return !!avail && isUnavailable(broker.value(avail)?.payload);
    }

    /** The last payload of a topic. */
    protected payload(topic: string | undefined): string | undefined {
        return topic ? broker.value(topic.trim())?.payload : undefined;
    }

    override onWillAppear(ev: WillAppearEvent<S>): void {
        if (!ev.action.isKey()) return;
        const inst: KeyInstance<S> = { id: ev.action.id, action: ev.action, settings: ev.payload.settings, topics: new Set() };
        this.instances.set(inst.id, inst);
        this.listen(inst);
        this.render(inst);
    }

    override onWillDisappear(ev: WillDisappearEvent<S>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        this.disappeared(inst);
        broker.release(inst.id);
        this.instances.delete(inst.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<S>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        inst.settings = ev.payload.settings;
        this.listen(inst);
        this.render(inst);
    }

    override onKeyDown(ev: KeyDownEvent<S>): void {
        const inst = this.instances.get(ev.action.id);
        if (!inst) return;
        if ((this.source(inst) === "ha" ? ha.state : broker.state) !== "online") {
            void ev.action.showAlert();
            return;
        }
        this.press(inst);
    }

    protected render(inst: KeyInstance<S>): void {
        inst.seen = this.entityIds(inst).map((id) => ha.entities[id]);
        const image = this.image(inst);
        if (image === inst.lastImage) return;
        inst.lastImage = image;
        void inst.action.setImage(image).catch((e) => streamDeck.logger.warn(`[${this.name}] setImage failed`, e));
    }

    private listen(inst: KeyInstance<S>): void {
        const mqtt = this.source(inst) === "mqtt";
        inst.topics = syncTopics(inst.id, inst.topics, mqtt ? [...this.topicsOf(inst.settings), inst.settings.availabilityTopic] : []);
    }
}

/** Subscribe an action's wanted topics and drop the ones it no longer needs; returns the new set. */
export function syncTopics(owner: string, current: Set<string>, wanted: (string | undefined)[]): Set<string> {
    const next = new Set(wanted.map((t) => t?.trim()).filter((t): t is string => !!t));
    for (const t of current) if (!next.has(t)) broker.unsubscribe(t, owner);
    for (const t of next) if (!current.has(t)) broker.subscribe(t, owner);
    return next;
}
