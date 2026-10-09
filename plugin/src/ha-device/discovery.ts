// The bridge device "HA-C auf <PC>" over MQTT Discovery (HA-device grill 2026-10-01, cover-light
// grill 2026-10-09). Topics are keyed by the plugin's MQTT client id (kept across restarts), so a
// second PC makes a second device. Its first entity: the sensor "Coverfarbe".
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

export function bridgeTopics(nodeId: string) {
    return {
        /** "online"/"offline", retained; the last will sets "offline". */
        status: `ha-c/${nodeId}/status`,
        coverColor: {
            config: `homeassistant/sensor/${nodeId}/cover_color/config`,
            state: `ha-c/${nodeId}/cover_color`,
            attributes: `ha-c/${nodeId}/cover_color/attributes`,
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
