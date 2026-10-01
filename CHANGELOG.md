# Changelog

All notable changes to HA-C (Home Assistant Controller, formerly MQ-C / MQTT Controller) are documented here.

## [Unreleased]

### Changed
- The settings say "MQTT broker" and "MQTT device", to keep MQTT apart from the Home Assistant connection.
- MQ-C (MQTT Controller) becomes **HA-C, Home Assistant Controller**: one plugin for Home Assistant and MQTT. New plugin id `de.boriskemper.ha-controller`, logo on Endeavour blue. Nothing was published as HA-C, so no settings move.

### Added
- **Home Assistant connection** (card in every key's settings): address and long-lived token, search on the network (zeroconf), status with HA's version and the number of entities; reconnects by itself, a refused token stops retrying. The WebSocket API through `home-assistant-js-websocket`. Keys don't use HA entities yet.
- A source that isn't set up while the other one is folds away to one line ("Not set up · Optional").
- deckbus `status` covers both sources: online when Home Assistant or the broker is.
- zigbee2mqtt devices show their state right away: zigbee2mqtt keeps no state on the broker, so HA-C asks such a device once (`…/get`) when nothing is known about it.
- zigbee2mqtt devices that Home Assistant discovery announces with the bridge's availability only are still shown offline when they are (`…/availability`).
- **Switch** key: switches a device between two values and shows its state (icon and colour per state, a name). Shows the new state at once and goes back if the device doesn't confirm within 3 s. Offline look while the broker is unreachable or the device reports itself unavailable. Keys without a state topic send on and off by turns.
- **Value** key: a value with its unit as large text or on a half-circle gauge, coloured by your colour ranges (base colour plus "from …" ranges, previewed in the settings); decimals as sent or rounded; text values shown as they are; offline look.
- Switch key: on/off values are recognised without settings (`ON`/`OFF`, `true`/`false`, `1`/`0`, `open`/`closed`), and commands use the device's own words (an ioBroker Homematic lamp that reports `true` gets `false`). Optional value line under the icon (e.g. the power), whose colour ranges can colour the icon while on.
- Value key: optional press action: switch something on and off (framed while on) or send a fixed payload.
- **Publish** key: sends a fixed payload on every press; optionally asks for a second press first (armed for 3 s).
- **Multi-state** key: steps through a list of states (value, name, icon, colour each), shows the reported one with dots for its position, confirms or goes back after 3 s; the settings take the device's current value into the list in one click.
- **Slider** dial: rotate to set a value (min, max, step; template like `{"brightness":{value}}`), the latest value sent at most every 150 ms, confirmed or back after 3 s; half circle with colour ranges or ring; optional actual value (thermostat: the arc shows the room temperature, a marker the setpoint); push or tap switches something on and off (dimmed with "Off" while off) or sends a payload. "Show in percent" shows any device range (0–254, 0–255, 0–100) as 0–100 %.
- Finding topics: **Browse** (all topics as a tree with values) and **Listen** (switch the device within 10 s, pick from the topics that changed; busy topics last, command topics left out) under every topic field. **Test** ("Switch once") on the Switch key and the press actions: shows whether the device confirmed within 3 s, or what was sent and what the state topic says.
- **Home Assistant discovery:** every action's settings start with a device picker (shown when the broker has discovery configs): search, pick, and topics, values, JSON fields, availability, icon and name are filled in. Understands full and abbreviated configs, the "~" base topic, JSON lights with brightness scale, value templates like `{{ value_json.x }}` (also with filters and true/false tests) and command templates with `{{ value }}`. Lights fit the Switch key and the Slider dial (in percent, push = on/off); thermostats (`climate`) fit the Slider dial with the room temperature as the actual value.
- Payloads: plain text or a field of a JSON payload (`state`, `color.x`); on/off values compared without case; publish templates like `{"state":"{value}"}`; separate values to send (Shelly Gen2: reports `true`, takes `on`); retain and QoS.
- **Topic help** in the settings: a live search over every topic on the broker with its current value; recognised schemes (zigbee2mqtt, Tasmota, Shelly Gen1 and Gen2+, ESPHome, `…/state` → `…/set`) fill in the command topic, field, values and availability in one click; the fields of a JSON payload can be picked by clicking them.
- **Broker** card in every key's settings: address (`mqtt://`, `mqtts://`, `ws://`, `wss://`, or a bare host), login, self-signed certificates, Connect. One broker for all keys, a client id kept across restarts, reconnects with a growing delay, a clear "Access denied".
- **deckbus:** HA-C tells other plugins whether the broker is reachable (`status`) and where its keys are (`actions`).
