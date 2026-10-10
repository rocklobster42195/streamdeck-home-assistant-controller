// The Coverlicht keys (cover-light grill 2026-10-09, Q6–Q9): lamps in Home Assistant follow the
// cover colour of a player on the deck. On: HA snapshots the lamps (scene.create), then they come on
// in the colour; on a new colour only lamps that are on are recoloured (one switched off by hand
// stays off); off: the snapshot comes back. A colour must stay for a second before it goes out,
// and a key's lamps get at most one command every 2 s. Knows nothing of Stream Deck.
//
// The snapshot is the key's own (brightness and colour as HA shows them), restored with plain
// light.turn_on calls and never with an effect: HA's scene snapshot also stores `effect`, and for
// Zigbee2MQTT lamps that attribute is stale (the lamp never reports it), so restoring it started
// "fireplace"/"candle" on a lamp that had been steady white (2026-10-10).
import { ACTIVE_ANY_PLAYER, type PlayerBoard } from "@rocklobster42195/streamdeck-kit";
import type { HaConnection } from "../ha/ha-connection";
import { renderCoverLightKey } from "../render/cover-light-key";
import { lampColor, type LampColor } from "./lamp-color";

export type CoverLightSettings = {
    lamps?: string[];
    /** The lamps' names as the picker showed them (for lamps HA doesn't list right now). */
    lampNames?: Record<string, string>;
    player?: string;
    /** Seconds the lamps take to fade into a colour (0–10, default 2). */
    transition?: number | string;
    /** Brightness in % the lamps get with every colour; empty: they keep theirs. */
    brightness?: number | string;
    label?: string;
    /** Switched on (kept across restarts). */
    active?: boolean;
    /** The lamps as they were when the key went on; what "off" restores. */
    snapshot?: Record<string, LampSnapshot>;
};

/** One lamp's state before the key switched it: on with brightness and colour, or off. */
export type LampSnapshot = {
    on: boolean;
    brightness?: number;
    color_temp_kelvin?: number;
    xy_color?: [number, number];
};

export const SETTLE_MS = 1000;
export const GAP_MS = 2000;

export type CoverLightsOptions = {
    board: Pick<PlayerBoard, "resolve" | "onChange">;
    ha: Pick<HaConnection, "state" | "entities" | "callService" | "onState">;
    draw: (id: string, image: string) => void;
    /** Stores a key's settings (on/off). */
    save: (id: string, settings: CoverLightSettings) => void;
    /** A key was switched on or off (or an active key's settings changed). */
    onActive?: () => void;
    settleMs?: number;
    gapMs?: number;
    now?: () => number;
};

type Key = {
    settings: CoverLightSettings;
    /** The colour the lamps got last (JSON of the LampColor). */
    sent?: string;
    sentAt: number;
    /** The colour waiting to settle. */
    pending?: string;
    timer?: ReturnType<typeof setTimeout>;
    /** Just switched on: the next colour switches every lamp on. */
    switchOn?: boolean;
    last?: string;
};

export class CoverLights {
    private readonly keys = new Map<string, Key>();
    private readonly offs: (() => void)[];
    private readonly now: () => number;

    constructor(private readonly o: CoverLightsOptions) {
        this.now = o.now ?? Date.now;
        this.offs = [o.board.onChange(() => this.changed()), o.ha.onState(() => this.changed())];
    }

    show(id: string, settings: CoverLightSettings): void {
        const k = this.keys.get(id);
        if (k) {
            k.settings = settings;
            k.last = undefined;
        } else this.keys.set(id, { settings, sentAt: 0 });
        this.follow(id);
        this.render(id);
        if (settings.active) this.o.onActive?.();
    }

    /** A key that was on before the plugin restarted, on a page not shown yet: its lamps follow again. */
    restore(id: string, settings: CoverLightSettings): void {
        if (this.keys.has(id) || !settings.active) return;
        this.keys.set(id, { settings, sentAt: 0 });
        this.follow(id);
    }

    /**
     * All keys at once (the switch "Coverlicht" in HA): on switches on every known key with lamps,
     * off every key that is on. Keys on pages not shown since the start aren't known.
     */
    async switchAll(on: boolean): Promise<void> {
        for (const [id, k] of [...this.keys]) {
            if (!!k.settings.active === on || !k.settings.lamps?.length) continue;
            await this.press(id).catch(() => {});
        }
    }

    /** The keys that are on. */
    active(): { id: string; settings: CoverLightSettings }[] {
        return [...this.keys].filter(([, k]) => k.settings.active).map(([id, k]) => ({ id, settings: k.settings }));
    }

    /**
     * The key left the page: one that is on keeps its lamps following (until it shows again and is
     * switched off, or the plugin restarts); one that is off is forgotten.
     */
    hide(id: string): void {
        const k = this.keys.get(id);
        if (k?.settings.active) return;
        clearTimeout(k?.timer);
        this.keys.delete(id);
    }

    /** On/off; rejects when it can't (no lamps, Home Assistant not there, HA refused). */
    async press(id: string): Promise<void> {
        const k = this.keys.get(id);
        if (!k) return;
        const lamps = k.settings.lamps ?? [];
        if (this.o.ha.state !== "online" || !lamps.length) throw new Error("cover light: no lamps or no Home Assistant");
        const transition = transitionOf(k.settings);
        if (k.settings.active) {
            clearTimeout(k.timer);
            k.pending = k.sent = undefined;
            const snapshot = k.settings.snapshot;
            this.set(id, k, false, undefined);
            if (!snapshot) {
                // Switched on by an older version: its snapshot is HA's scene
                if (!(await this.o.ha.callService("scene", "turn_on", { entity_id: `scene.${sceneId(id)}`, transition }))) throw new Error("cover light: snapshot gone");
                return;
            }
            const results = await Promise.all(lamps.map((l) => this.restoreLamp(l, snapshot[l], transition)));
            if (results.includes(false)) throw new Error("cover light: lamps not restored");
            return;
        }
        const snapshot = Object.fromEntries(lamps.map((l) => [l, this.snapshotOf(l)]));
        k.switchOn = true;
        k.sent = undefined;
        this.set(id, k, true, snapshot);
        this.follow(id, true);
    }

    dispose(): void {
        for (const off of this.offs) off();
        for (const k of this.keys.values()) clearTimeout(k.timer);
        this.keys.clear();
    }

    private snapshotOf(lamp: string): LampSnapshot {
        const e = this.o.ha.entities[lamp];
        if (e?.state !== "on") return { on: false };
        const a = e.attributes ?? {};
        const snap: LampSnapshot = { on: true };
        if (typeof a.brightness === "number") snap.brightness = a.brightness;
        // One colour only: the mode the lamp is in
        if (a.color_mode === "color_temp" && typeof a.color_temp_kelvin === "number") snap.color_temp_kelvin = a.color_temp_kelvin;
        else if (Array.isArray(a.xy_color) && a.xy_color.length === 2) snap.xy_color = [Number(a.xy_color[0]), Number(a.xy_color[1])];
        else if (typeof a.color_temp_kelvin === "number") snap.color_temp_kelvin = a.color_temp_kelvin;
        return snap;
    }

    /** Puts a lamp back as it was; no effect is ever sent (see the top of the file). */
    private restoreLamp(lamp: string, snap: LampSnapshot | undefined, transition: number): Promise<boolean> {
        // A lamp that joined the key after it went on has no snapshot: it stays as it is
        if (!snap) return Promise.resolve(true);
        if (!snap.on) return this.o.ha.callService("light", "turn_off", { entity_id: lamp, transition });
        return this.o.ha.callService("light", "turn_on", {
            entity_id: lamp,
            transition,
            ...(snap.brightness !== undefined ? { brightness: snap.brightness } : {}),
            ...(snap.color_temp_kelvin !== undefined ? { color_temp_kelvin: snap.color_temp_kelvin } : {}),
            ...(snap.xy_color ? { xy_color: snap.xy_color } : {}),
        });
    }

    private set(id: string, k: Key, active: boolean, snapshot: Record<string, LampSnapshot> | undefined): void {
        k.settings = { ...k.settings, active, snapshot };
        this.o.save(id, k.settings);
        this.render(id);
        this.o.onActive?.();
    }

    private changed(): void {
        for (const id of this.keys.keys()) {
            this.follow(id);
            this.render(id);
        }
    }

    private colorOf(k: Key): LampColor | undefined {
        const color = this.o.board.resolve(k.settings.player || ACTIVE_ANY_PLAYER)?.color;
        return color ? lampColor(color) : undefined;
    }

    /** A new colour for an active key: settled, then at most one command per GAP_MS. */
    private follow(id: string, immediately = false): void {
        const k = this.keys.get(id);
        if (!k?.settings.active || this.o.ha.state !== "online") return;
        const c = this.colorOf(k);
        // No colour (nothing plays): the lamps stay as they are
        if (!c) return;
        const json = JSON.stringify(c);
        if (json === k.sent && !k.switchOn) {
            clearTimeout(k.timer);
            k.pending = undefined;
            return;
        }
        if (json === k.pending && !immediately) return;
        k.pending = json;
        clearTimeout(k.timer);
        const settle = immediately ? 0 : (this.o.settleMs ?? SETTLE_MS);
        const gap = Math.max(0, k.sentAt + (this.o.gapMs ?? GAP_MS) - this.now());
        k.timer = setTimeout(() => void this.send(id), Math.max(settle, gap));
    }

    private async send(id: string): Promise<void> {
        const k = this.keys.get(id);
        if (!k?.settings.active || !k.pending) return;
        const c = JSON.parse(k.pending) as LampColor;
        const lamps = (k.settings.lamps ?? []).filter((l) => k.switchOn || this.o.ha.entities[l]?.state === "on");
        k.sent = k.pending;
        k.pending = undefined;
        k.switchOn = false;
        k.sentAt = this.now();
        if (!lamps.length) return;
        const brightness = Number(k.settings.brightness);
        await this.o.ha.callService("light", "turn_on", {
            entity_id: lamps,
            transition: transitionOf(k.settings),
            ...c,
            ...(k.settings.brightness !== undefined && k.settings.brightness !== "" && brightness > 0 ? { brightness_pct: Math.min(100, brightness) } : {}),
        });
    }

    private render(id: string): void {
        const k = this.keys.get(id);
        if (!k) return;
        const p = this.o.board.resolve(k.settings.player || ACTIVE_ANY_PLAYER);
        // The cover's colour, as on the family's other keys (the lamps get it vivid)
        const image = renderCoverLightKey({
            active: !!k.settings.active,
            color: p?.color,
            playing: !!p?.playing,
            unavailable: this.o.ha.state !== "online" || !k.settings.lamps?.length,
            label: k.settings.label,
        });
        if (image === k.last) return;
        k.last = image;
        this.o.draw(id, image);
    }
}

/** HA's scene for a key's snapshot ("scene.ha_c_coverlight_…"). */
export function sceneId(id: string): string {
    return `ha_c_coverlight_${id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16)}`;
}

function transitionOf(s: CoverLightSettings): number {
    const n = Number(s.transition);
    return s.transition === undefined || s.transition === "" || !Number.isFinite(n) ? 2 : Math.min(10, Math.max(0, n));
}
