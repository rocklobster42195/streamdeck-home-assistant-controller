# Changelog

All notable changes to MQ-C (MQTT Controller) are documented here.

## [Unreleased]

### Added
- **Switch** key: switches a device between two values and shows its state (icon and colour per state, a name). Shows the new state at once and goes back if the device doesn't confirm within 3 s. Offline look while the broker is unreachable or the device reports itself unavailable. Keys without a state topic send on and off by turns.
- **Value** key: a value with its unit as large text or on a half-circle gauge, coloured by your colour ranges (base colour plus "from …" ranges, previewed in the settings); decimals as sent or rounded; text values shown as they are; offline look.
- Switch key: on/off values are recognised without settings (`ON`/`OFF`, `true`/`false`, `1`/`0`, `open`/`closed`), and commands use the device's own words (an ioBroker Homematic lamp that reports `true` gets `false`). Optional value line under the icon (e.g. the power), whose colour ranges can colour the icon while on.
- Value key: optional press action: switch something on and off (framed while on) or send a fixed payload.
- **Publish** key: sends a fixed payload on every press; optionally asks for a second press first (armed for 3 s).
- **Multi-state** key: steps through a list of states (value, name, icon, colour each), shows the reported one with dots for its position, confirms or goes back after 3 s; the settings take the device's current value into the list in one click.
- **Slider** dial: rotate to set a value (min, max, step; template like `{"brightness":{value}}`), the latest value sent at most every 150 ms, confirmed or back after 3 s; half circle with colour ranges or ring; optional actual value (thermostat: the arc shows the room temperature, a marker the setpoint); push or tap switches something on and off (dimmed with "Off" while off) or sends a payload. "Show in percent" shows any device range (0–254, 0–255, 0–100) as 0–100 %.
- Finding topics: **Browse** (all topics as a tree with values) and **Listen** (switch the device within 10 s, pick from the topics that changed; busy topics last, command topics left out) under every topic field. **Test** ("Switch once") on the Switch key and the press actions: shows whether the device confirmed within 3 s, or what was sent and what the state topic says.
- Payloads: plain text or a field of a JSON payload (`state`, `color.x`); on/off values compared without case; publish templates like `{"state":"{value}"}`; separate values to send (Shelly Gen2: reports `true`, takes `on`); retain and QoS.
- **Topic help** in the settings: a live search over every topic on the broker with its current value; recognised schemes (zigbee2mqtt, Tasmota, Shelly Gen1 and Gen2+, ESPHome, `…/state` → `…/set`) fill in the command topic, field, values and availability in one click; the fields of a JSON payload can be picked by clicking them.
- **Broker** card in every key's settings: address (`mqtt://`, `mqtts://`, `ws://`, `wss://`, or a bare host), login, self-signed certificates, Connect. One broker for all keys, a client id kept across restarts, reconnects with a growing delay, a clear "Access denied".
- **deckbus:** MQ-C tells other plugins whether the broker is reachable (`status`) and where its keys are (`actions`).
