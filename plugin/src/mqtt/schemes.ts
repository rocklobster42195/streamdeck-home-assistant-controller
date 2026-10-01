// Known topic schemes: from the state topic a user picked, guess where commands go, which JSON
// field holds the state, the on/off values and the availability topic. Home Assistant discovery
// brings all of this itself; the schemes help with devices that don't announce themselves.

export type SchemeId = "zigbee2mqtt" | "tasmota" | "shelly-gen1" | "shelly-gen2" | "esphome" | "generic";

export type TopicSuggestion = {
    scheme: SchemeId;
    commandTopic: string;
    /** JSON field of the state payload ("state", "POWER", "output"); empty for plain text. */
    field?: string;
    /** Values the state reports. */
    onValue?: string;
    offValue?: string;
    /** Values to send, when they differ from the reported ones (Shelly Gen2: reports true, takes "on"). */
    commandOn?: string;
    commandOff?: string;
    /** Publish template, e.g. `{"state":"{value}"}`. */
    template?: string;
    availabilityTopic?: string;
};

type Rule = { scheme: SchemeId; match: RegExp; build: (m: RegExpExecArray, payload?: string) => Omit<TopicSuggestion, "scheme"> | undefined };

const RULES: Rule[] = [
    {
        // zigbee2mqtt/<friendly name> with a JSON state; not the bridge or the device's sub-topics
        scheme: "zigbee2mqtt",
        match: /^(zigbee2mqtt)\/(?!bridge(?:\/|$))(.+?)$/,
        build: (m) => {
            if (/\/(set|get|availability)$/.test(m[2])) return undefined;
            const base = `${m[1]}/${m[2]}`;
            return { commandTopic: `${base}/set`, field: "state", onValue: "ON", offValue: "OFF", template: `{"state":"{value}"}`, availabilityTopic: `${base}/availability` };
        },
    },
    {
        // Tasmota: stat/<topic>/POWER[n] (plain ON/OFF)
        scheme: "tasmota",
        match: /^stat\/([^/]+)\/(POWER\d*)$/,
        build: (m) => ({ commandTopic: `cmnd/${m[1]}/${m[2]}`, onValue: "ON", offValue: "OFF", availabilityTopic: `tele/${m[1]}/LWT` }),
    },
    {
        // Tasmota: tele/<topic>/STATE or stat/<topic>/RESULT (JSON with POWER)
        scheme: "tasmota",
        match: /^(?:tele\/([^/]+)\/STATE|stat\/([^/]+)\/RESULT)$/,
        build: (m) => {
            const t = m[1] ?? m[2];
            return { commandTopic: `cmnd/${t}/POWER`, field: "POWER", onValue: "ON", offValue: "OFF", availabilityTopic: `tele/${t}/LWT` };
        },
    },
    {
        // Shelly Gen1: shellies/<id>/relay/<n> (plain on/off)
        scheme: "shelly-gen1",
        match: /^(shellies\/[^/]+)\/relay\/(\d+)$/,
        build: (m) => ({ commandTopic: `${m[1]}/relay/${m[2]}/command`, onValue: "on", offValue: "off", availabilityTopic: `${m[1]}/online` }),
    },
    {
        // Shelly Gen2+: <prefix>/status/switch:<n> (JSON, "output": true/false), commands on/off
        scheme: "shelly-gen2",
        match: /^(.+)\/status\/(switch:\d+)$/,
        build: (m) => ({
            commandTopic: `${m[1]}/command/${m[2]}`,
            field: "output",
            onValue: "true",
            offValue: "false",
            commandOn: "on",
            commandOff: "off",
            availabilityTopic: `${m[1]}/online`,
        }),
    },
    {
        // ESPHome: <node>/<component>/<name>/state; lights use a JSON state
        scheme: "esphome",
        match: /^([^/]+)\/(switch|light|fan|button|number|select|cover|climate|lock)\/([^/]+)\/state$/,
        build: (m, payload) => {
            const base = `${m[1]}/${m[2]}/${m[3]}`;
            const json = m[2] === "light" || payload?.trim().startsWith("{");
            return {
                commandTopic: `${base}/command`,
                ...(json ? { field: "state", template: `{"state":"{value}"}` } : {}),
                onValue: "ON",
                offValue: "OFF",
                availabilityTopic: `${m[1]}/status`,
            };
        },
    },
    {
        // Anything ending in /state or /status: commands usually go to /set
        scheme: "generic",
        match: /^(.+)\/(state|status)$/,
        build: (m) => ({ commandTopic: `${m[1]}/set` }),
    },
];

/** A suggestion for a state topic, or undefined when no scheme fits. */
export function suggestForTopic(stateTopic: string, payload?: string): TopicSuggestion | undefined {
    const topic = stateTopic.trim();
    for (const rule of RULES) {
        const m = rule.match.exec(topic);
        if (!m) continue;
        const s = rule.build(m, payload);
        if (s) return { scheme: rule.scheme, ...s, ...(rule.scheme === "generic" && payload !== undefined ? onOffFromPayload(payload) : {}) };
    }
    return undefined;
}

/** On/off values that fit a plain payload ("ON" → ON/OFF, "true" → true/false, "1" → 1/0). */
export function onOffFromPayload(payload: string): Pick<TopicSuggestion, "onValue" | "offValue"> {
    const pairs: [string, string][] = [
        ["ON", "OFF"],
        ["on", "off"],
        ["true", "false"],
        ["1", "0"],
        ["open", "closed"],
    ];
    const v = payload.trim();
    for (const [on, off] of pairs) if (v === on || v === off) return { onValue: on, offValue: off };
    for (const [on, off] of pairs) if (v.toLowerCase() === on.toLowerCase() || v.toLowerCase() === off.toLowerCase()) return { onValue: on, offValue: off };
    return {};
}

/** Whether an availability payload means "offline" (plain or zigbee2mqtt's {"state":"offline"}). */
export function isUnavailable(payload: string | undefined): boolean {
    if (payload === undefined) return false;
    let v = payload.trim();
    if (v.startsWith("{")) {
        try {
            v = String((JSON.parse(v) as { state?: unknown }).state ?? "");
        } catch {
            return false;
        }
    }
    return /^(offline|false|0|unavailable|disconnected|lost)$/i.test(v.trim());
}
