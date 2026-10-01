# Changelog

All notable changes to HA-C (Home Assistant Controller, formerly MQ-C / MQTT Controller) are documented here.

## [Unreleased]

### Changed
- **The family's key look** (the kit's key style, as MA-C): a switched-on key gets a tinted plate and a rounded frame in its colour; names are bold captions in the icon's colour, cut with "…" when too long.
- **A Stream Deck title replaces HA-C's name:** while you type a title in Stream Deck, the key draws no name of its own, so the two never overlap.
- Shorter settings panels: icon pickers move to the settings window ("Icons"); the Trigger key's "Ask first" gets its own section; the Multi-state panel shows its states in one line, a click opens the window at them.
- A typed zigbee2mqtt topic suggests `…/availability` only when something is there (availability may be off for the device).
- The half circle on the dial no longer draws the icon over the name.
- Keys confirm in their own colour instead of Stream Deck's green check: a disc grows, a white check mark draws itself (Trigger in its colour, Yellow Sea by default); errors show an exclamation mark on red instead of the yellow triangle. The Slider dial shows the red alert on its touch strip too.
- A key that isn't set up yet says so under its blue "Set up …" button (pick a device, or set it up with a topic).
- The device picker also finds entities by their kind, in German and English: "Thermostat" or "Heizung" finds every climate entity, "Rollladen" every cover, "Lampe" every light.
- The device picker lists up to 300 entities without a search (was 80), so entities without an area at the end aren't cut off.
- Numbers on keys and dials use Stream Deck's language: "19,4 °C" in German. What goes to a device keeps the point; IP addresses and versions stay as they are.
- Value key with an icon: the icon large at the top and two lines under it (value and second value, or name and value), as other HA plugins show it; long names end in "…".
- Keys use the family's plain, large icons: 112 px without text (as in MA-C), 88 px with a name; no glow circle behind a switched-on icon.
- The settings window fits Stream Deck's fixed 500 × 650 window: no page title, the menu is one wrapping bar at the top with short names.
- The connection cards show "Connect" only to try again after a failure; changed settings connect by themselves.
- The settings say "MQTT broker" and "MQTT device", to keep MQTT apart from the Home Assistant connection.
- MQ-C (MQTT Controller) becomes **HA-C, Home Assistant Controller**: one plugin for Home Assistant and MQTT. New plugin id `de.boriskemper.ha-controller`, logo on Endeavour blue. Nothing was published as HA-C, so no settings move.

### Added
- **Value key press with Home Assistant:** "Switch" toggles another HA entity (a light, plug, lock …; the frame shows whether it is on), "Trigger" runs a scene, script, button or automation. The press choice's third tile is called "Trigger" now.
- **Slider dial looks:** the open ring (Home Assistant's style, the kit's `openRing`) is the default now: the value with a handle, the unit raised, "Off" while off; a thermostat shows its setpoint, a dot and the room temperature in the gap, and its mode on top. Half circle, ring (MA-C) and **pie** (Sonos Controller) stay to choose.
- **Colour picker** (from the kit) everywhere a colour is chosen, including the Multi-state states and the colour ranges: 17 standard colours, recent colours, colour wheel with brightness, hex and R/G/B.
- Slider dial on a thermostat: a push steps through its modes (auto → heat → off, as HA lists them); the mode shows in the corner in HA's words, the dial dims while off.
- **States in your language:** an HA state that isn't a number shows as HA writes it, in Stream Deck's language ("Bewölkt" for cloudy, "Geöffnet" for an open door), also for the states of a Multi-state key; HA's own texts (`frontend/get_translations`).
- **HA's own icons, also the changing ones:** keys show the icon Home Assistant shows (an icon set in HA, the icon attribute, or HA's icon tables by integration and device class), following the state and value: the weather's condition, a battery's level, a lock open or closed. Lights on the Switch key keep the bulb that lights up.
- **No name on a key:** "No name" under the name field hides it, also the one from Home Assistant; an empty name field shows HA's.
- **Slider dial with Home Assistant:** lights (brightness in %, 0 % switches off), fans (speed), covers (position) with push to switch on and off; thermostats (setpoint within HA's limits, room temperature on the arc); `number` / `input_number` with their own range, step and unit. Lights that can only switch stay off the dial.
- The half circle on the dial sits a little higher, so the range under its ends is easy to read.
- **Multi-state key with Home Assistant:** steps through the options of a select or input select (`select_option`); picking one fills in the states from its options, each with a colour.
- The settings window has a menu on the left with the sections this key shows; the one in view is highlighted, a click scrolls to it.
- The **Publish** key is now called **Trigger** ("Auslösen" in German); existing keys keep working.
- **Trigger key with Home Assistant:** runs a scene (`scene.turn_on`), script (`script.turn_on`), button or input button (`press`) or automation (`automation.trigger`); a check mark when HA accepted the call, an alert when it refused. "Confirm" (press twice) works for both sources.
- HA keys without an icon of their own get their domain's (a scene's palette, a script, a lock, a fan, …); lights keep the bulb.
- **HA attributes:** a Value key on an HA entity can show one of its attributes instead of the state (e.g. a thermostat's `current_temperature`; brightness in %), picked from a list with the current values.
- **Second line on the Value key:** a second, smaller value under the first (text look) or at the bottom (gauge), from another HA entity or attribute, or another MQTT topic, with its own unit and decimals.
- The Switch key's value line works with HA too: an attribute of the key's entity (e.g. the brightness) or another entity (e.g. the plug's power).
- **Settings window:** the key's settings stay short (device, display, "More settings …" or "Set up …", one status line per connection); everything else opens in a roomy window (MQTT topics, colour ranges, press action, advanced, both connections). The window is the same page in a bigger frame and uses the settings panel's connection; it closes with the panel. When it can't open, the panel shows everything itself.
- **Every key has a source:** a Home Assistant entity or MQTT topics. Switch and Value keys can show HA entities: lights, switches, input booleans, fans, sirens, humidifiers, locks and covers on the Switch key (turned on and off through HA's services, shown at once, back after 3 s without confirmation), sensors, binary sensors, numbers and the like on the Value key (with HA's unit). Name and icon come from HA unless set on the key; unavailable entities look offline. Keys with topics stay on MQTT; a new key starts with HA when it is set up.
- **One device picker for both sources:** HA entities by area (with their device) and MQTT discovery entities by device, each with an HA or MQTT badge, plus "Topic by hand". For an HA key the MQTT sections are hidden.
- **Home Assistant connection** (card in every key's settings): address and long-lived token, search on the network (zeroconf), status with HA's version and the number of entities; reconnects by itself, a refused token stops retrying. The WebSocket API through `home-assistant-js-websocket`.
- A source that isn't set up while the other one is folds away to one line ("Not set up · Optional").
- deckbus `status` covers both sources: online when Home Assistant or the broker is.
- zigbee2mqtt devices show their state right away: zigbee2mqtt keeps no state on the broker, so HA-C asks such a device once (`…/get`) when nothing is known about it.
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
