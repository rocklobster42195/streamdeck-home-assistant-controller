// The bridge device "HA-C auf <PC>" over MQTT Discovery (HA-device grill 2026-10-01, cover-light
// grill 2026-10-09). Topics are keyed by the plugin's MQTT client id (kept across restarts), so a
// second PC makes a second device. Entities: the sensor "Coverfarbe", whether Stream Deck is
// online (the broker's last will says "offline"), and the switch "Coverlicht" (the Cover Light keys).
export type BridgeInfo = {
    /** The MQTT client id ("hac-1a2b3c4d"): node id and device identifier. */
    nodeId: string;
    /** The computer's name. */
    host: string;
    version: string;
    /** Stream Deck's language, for the names HA shows. */
    language: string;
};

/** The REST fallback's entity, and the entity id the discovered sensor asks for. */
export const COVER_COLOR_ENTITY = "sensor.ha_c_cover_color";
export const ONLINE_ENTITY = "binary_sensor.ha_c_stream_deck";
export const COVER_LIGHT_ENTITY = "switch.ha_c_cover_light";

export function bridgeTopics(nodeId: string) {
    return {
        /** "online"/"offline", retained; the last will sets "offline". */
        status: `ha-c/${nodeId}/status`,
        coverColor: {
            config: `homeassistant/sensor/${nodeId}/cover_color/config`,
            state: `ha-c/${nodeId}/cover_color`,
            attributes: `ha-c/${nodeId}/cover_color/attributes`,
        },
        online: { config: `homeassistant/binary_sensor/${nodeId}/online/config` },
        coverLight: {
            config: `homeassistant/switch/${nodeId}/cover_light/config`,
            state: `ha-c/${nodeId}/cover_light`,
            set: `ha-c/${nodeId}/cover_light/set`,
        },
    };
}

const de = (language: string) => language.toLowerCase().startsWith("de");

export function bridgeDevice(info: BridgeInfo) {
    return {
        identifiers: [info.nodeId],
        name: de(info.language) ? `HA-C auf ${info.host}` : `HA-C on ${info.host}`,
        manufacturer: "Rocklobster",
        model: "HA-C (Stream Deck plugin)",
        sw_version: info.version,
    };
}

export function coverColorConfig(info: BridgeInfo) {
    const t = bridgeTopics(info.nodeId);
    return {
        name: de(info.language) ? "Coverfarbe" : "Cover colour",
        unique_id: `${info.nodeId}_cover_color`,
        // default_entity_id since HA 2025.10; object_id for older ones
        default_entity_id: COVER_COLOR_ENTITY,
        object_id: COVER_COLOR_ENTITY.slice("sensor.".length),
        icon: "mdi:palette",
        state_topic: t.coverColor.state,
        json_attributes_topic: t.coverColor.attributes,
        availability_topic: t.status,
        device: bridgeDevice(info),
    };
}

/** Whether Stream Deck (with HA-C) runs: "online" while connected, the last will says "offline". */
export function onlineConfig(info: BridgeInfo) {
    const t = bridgeTopics(info.nodeId);
    return {
        name: "Stream Deck",
        unique_id: `${info.nodeId}_online`,
        default_entity_id: ONLINE_ENTITY,
        object_id: ONLINE_ENTITY.slice("binary_sensor.".length),
        device_class: "connectivity",
        state_topic: t.status,
        payload_on: "online",
        payload_off: "offline",
        device: bridgeDevice(info),
    };
}

/** The Cover Light keys as one switch: on while one is on; on/off switches the deck's keys. */
export function coverLightConfig(info: BridgeInfo) {
    const t = bridgeTopics(info.nodeId);
    return {
        name: de(info.language) ? "Coverlicht" : "Cover light",
        unique_id: `${info.nodeId}_cover_light`,
        default_entity_id: COVER_LIGHT_ENTITY,
        object_id: COVER_LIGHT_ENTITY.slice("switch.".length),
        icon: "mdi:lightbulb-auto",
        state_topic: t.coverLight.state,
        command_topic: t.coverLight.set,
        availability_topic: t.status,
        device: bridgeDevice(info),
    };
}
