# Changelog

All notable changes to MQ-C (MQTT Controller) are documented here.

## [Unreleased]

### Added
- **Switch** key: switches a device between two values and shows its state (icon and colour per state, a name). Shows the new state at once and goes back if the device doesn't confirm within 3 s. Offline look while the broker is unreachable or the device reports itself unavailable. Keys without a state topic send on and off by turns.
- **Value** key: a value with its unit as large text or on a half-circle gauge, coloured by your colour ranges (base colour plus "from …" ranges, previewed in the settings); decimals as sent or rounded; text values shown as they are; offline look.
- Payloads: plain text or a field of a JSON payload (`state`, `color.x`); on/off values compared without case; publish templates like `{"state":"{value}"}`; separate values to send (Shelly Gen2: reports `true`, takes `on`); retain and QoS.
- **Topic help** in the settings: a live search over every topic on the broker with its current value; recognised schemes (zigbee2mqtt, Tasmota, Shelly Gen1 and Gen2+, ESPHome, `…/state` → `…/set`) fill in the command topic, field, values and availability in one click; the fields of a JSON payload can be picked by clicking them.
- **Broker** card in every key's settings: address (`mqtt://`, `mqtts://`, `ws://`, `wss://`, or a bare host), login, self-signed certificates, Connect. One broker for all keys, a client id kept across restarts, reconnects with a growing delay, a clear "Access denied".
- **deckbus:** MQ-C tells other plugins whether the broker is reachable (`status`) and where its keys are (`actions`).
