# HA-C — Home Assistant Controller for Stream Deck

Switch and show your smart home on your Stream Deck: lights, plugs, sensors, scenes, thermostats, blinds. HA-C talks to **Home Assistant** directly, and to **any MQTT broker** as a second source (zigbee2mqtt, Tasmota, Shelly, ESPHome, ioBroker, Node-RED …). Pick a device by name, room or label; HA-C fills in the rest and draws the key the way Home Assistant shows it: its icon, its state text, its colours.

> Unofficial community plugin. Not affiliated with Elgato or Home Assistant / the Open Home Foundation.

**Looking for something simpler?** If you only use Home Assistant and want a lean, proven plugin, have a look at the [Home Assistant plugin by cgiesche](https://github.com/cgiesche/streamdeck-homeassistant): it has been around for years and does the basics very well. HA-C's focus is different: Home Assistant and MQTT side by side, gauges and dials, a short settings panel with a settings window for the details, and working together with the other plugins of its family.

**Status:** early, in daily use on a Stream Deck +. All actions work with Home Assistant entities and with MQTT topics.

## Contents

- [Quick start](#quick-start)
- [Actions](#actions)
- [The settings: short panel and settings window](#the-settings-short-panel-and-settings-window)
- [Picking a device](#picking-a-device)
- [Names, icons and colours](#names-icons-and-colours)
- [Panorama effects behind the dials](#panorama-effects-behind-the-dials)
- [Connecting to Home Assistant](#connecting-to-home-assistant)
- [Connecting to your MQTT broker](#connecting-to-your-mqtt-broker)
- [Home Assistant or MQTT?](#home-assistant-or-mqtt)
- [Works with other plugins (deckbus)](#works-with-other-plugins-deckbus)
- [Troubleshooting](#troubleshooting)
- [Planned](#planned)
- [Development](#development)
- [Credits and licence](#credits-and-licence)

## Quick start

1. **Install** HA-C and drag a **Switch** key onto your Stream Deck.
2. **Connect Home Assistant:** in the key's settings press **Set up …**, then in **Connections** enter your Home Assistant address and a long-lived access token ([how](#connecting-to-home-assistant)). You do this once; every key uses it.
3. **Pick a device:** type part of its name or its room, e.g. "living room", and click the entity. Done: the key shows it and switches it.

Everything else is optional and waits behind **More settings …**.

## Actions

| Action | Kind | For |
|---|---|---|
| [Switch](#switch-key) | key | lights, plugs, fans, locks, anything with on and off |
| [Value](#value-key) | key | a temperature, power, humidity, a door, the weather |
| [Trigger](#trigger-key) | key | a scene, script, button or automation; a fixed MQTT command |
| [Multi-state](#multi-state-key) | key | stepping through a list: a fan's speeds, a heating mode, scenes |
| [Slider](#slider-dial-stream-deck--only) | dial | brightness, a thermostat's setpoint, a blind's position, a number |

### Switch *(key)*

Switches a light, plug or anything else with two states, and shows the state the device reports.

- **On:** a tinted plate and a rounded frame in the key's colour (Yellow Sea by default), the icon in that colour. **Off:** grey. **Unavailable:** dimmed with a red cloud.
- After a press the key shows the new state at once. If the device doesn't confirm within 3 seconds, the key goes back, so it never shows something that didn't happen.
- **Value line (optional):** a second value under the icon, e.g. the plug's power "42 W", from the same device or another one, also from an attribute. With colour ranges the key takes the colour of the range the value is in (green, red from 1000 W).
- **With Home Assistant:** lights, switches, input booleans, fans, sirens, humidifiers, locks and covers. *How it works:* HA-C calls the entity's own service (`light.turn_on` / `turn_off`, `lock.lock` / `unlock`, `cover.open_cover` / `close_cover` …) and shows the state HA reports back.
- **With MQTT:** `ON`/`OFF`, `true`/`false`, `1`/`0` and `open`/`closed` are recognised without setting anything; the key answers in the same words the device uses. Without a state topic (a gate that reports nothing) the key sends on and off by turns.

### Value *(key)*

Shows a value: a temperature, power, humidity, a door's state, the weather.

- **Looks:** **Text** (the value large, the unit below, optionally with an icon on top) **Half circle** (a gauge between minimum and maximum) or **Open** (the same on a ring open at the bottom, like the Slider dial: the value in the middle, the colour ranges as bands, e.g. for CO2).
- **Second line (optional):** another value below the first, e.g. humidity under the temperature.
- **Attributes:** besides the state, any attribute of an entity, e.g. a thermostat's `current_temperature` or the weather's `wind_speed`.
- **Colours:** a base colour and as many ranges as you like ("from 25 °C: red").
- **Numbers and states as HA writes them:** with a decimal comma in German, and states in Stream Deck's language ("Bewölkt" rather than "cloudy").
- **On press (optional):** switch another entity (e.g. the light in the room whose temperature the key shows; the key then shows on and off like the Switch key), or run a scene, script, button or automation. With MQTT: switch something, or send a fixed payload.

### Trigger *(key)*

Runs something once on every press: a Home Assistant scene, script, button or automation, or a fixed MQTT payload (a scene, opening a gate, a JSON command). The key confirms with a short animation in its colour; an error shows an exclamation mark on red.

- **Ask before sending:** the first press arms the key for 3 seconds ("Press again"), only a second press sends. For a gate, an alarm, anything you don't want to trigger by accident.
- *How it works:* scenes and scripts start with `scene.turn_on` / `script.turn_on`, buttons are pressed with `button.press` / `input_button.press`, automations run with `automation.trigger` (this skips their conditions, as "Run" in HA does). The confirmation means HA accepted the call; a script that keeps running (e.g. waiting for a door) runs on in HA.

### Multi-state *(key)*

Steps through a list on every press, e.g. a fan off → 1 → 2 → 3 → off, a heating mode or a list of scenes, and shows the one the device reports.

- Each state has a name, an icon and a colour; dots under the name show where you are in the list. The short panel shows the states in one line; a click opens them in the settings window.
- **With Home Assistant:** pick a *select* or *input select*. Its options become the states; remove the ones the key should skip. *How it works:* HA-C calls `select.select_option` with the next option.
- **With MQTT:** "Add …" takes the value the device reports right now into the list.

### Slider *(dial, Stream Deck + only)*

Sets a value by turning: a lamp's brightness, a thermostat's setpoint, a blind's position.

| Control | What it does |
|---|---|
| Rotate | Change the value (the step comes from HA, or the one you set) |
| Push / tap the display | Lights, fans, blinds: on and off. Thermostats: the next mode (e.g. auto → heat → off). MQTT: your choice |

- **Looks:** the **open ring** (the default, as Home Assistant draws its cards: the value with a handle, a thermostat with a dot at the room temperature), the **half circle**, the **ring** or the **pie**.
- The display follows at once; the device gets the latest value at most every 150 ms, so fast turning doesn't flood it. Without a confirmation within 3 seconds, the dial goes back to what the device reports.
- **With Home Assistant:** range, step and unit come from HA, there is nothing to set up. *How it works:* a light turns its brightness in percent (`light.turn_on` with `brightness_pct`; 0 % switches it off), a fan its speed (`fan.set_percentage`), a cover its position (`cover.set_cover_position`), a thermostat its setpoint (`climate.set_temperature`) within HA's limits, a push steps through its `hvac_modes` (`climate.set_hvac_mode`); `number` and `input_number` use `set_value`.
- **With MQTT:** enter the device's range as minimum and maximum. Devices count brightness differently (zigbee2mqtt 0–254, Homematic 0–255, others 0–100); with **Show in percent** the dial shows 0–100 % and sends in the device's range. With an actual-value topic it becomes a thermostat.
- **Effects behind the dial:** see [Panorama effects](#panorama-effects-behind-the-dials).

## The settings: short panel and settings window

Stream Deck's settings panel is narrow, so HA-C keeps it short: the device, how the key looks, and the connection in one line. **More settings …** opens a bigger **settings window** with everything else, and a menu to jump between its sections (Value, Display, Icons, Colours, Panorama, Connections …).

- While a key isn't set up yet, the button is blue and says **Set up …**.
- The window belongs to the key whose settings are open; it closes when you click another key in Stream Deck.
- If a window can't open, the panel shows everything itself.

## Picking a device

The **Device** field lists what fits the action: lights and switches for the Switch key, sensors for Value, scenes and scripts for Trigger, selects for Multi-state, lights, thermostats, blinds and numbers for the Slider.

- **Search** by name, entity ID, device, **area** ("bathroom" lists everything in the bathroom, also entities that only get their area from their device), **label** (as you set them in Home Assistant) or kind ("thermostat", "Lampe").
- Each entry has a badge: **HA** for a Home Assistant entity, **MQTT** for a device that announces itself through MQTT discovery on your broker. Picking one fills in everything below.
- **Topic by hand:** for an MQTT device without discovery, enter the topics yourself (see [MQTT](#connecting-to-your-mqtt-broker)).
- Hidden and disabled entities are left out, as in Home Assistant.

## Names, icons and colours

- **Names:** HA-C writes the key's name under its icon: your own, or the one from Home Assistant. **No name** hides it. If you type a **title** in Stream Deck instead, HA-C leaves its own name out, so the two never overlap. Names are white by default; **Name in the key's colour** colours them.
- **Icons:** keys show the icon Home Assistant shows for the entity, and it changes with the state as in HA: a cloud or a sun for the weather, a battery's level, a lock open or closed. An icon you set on the entity in HA wins; one you pick on the key wins over that. *How it works:* HA-C asks HA for its icon tables (`frontend/get_icons`) and picks the icon as HA's own frontend does.
- **Colours:** the colour picker offers 17 standard colours around the colour wheel, your recent colours, a colour wheel with brightness, hex and R/G/B.

## Panorama effects behind the dials

On a Stream Deck +, an effect (particles, matrix rain, Boing ball, Boing globe) can run behind the dials, across all four displays like one picture, also behind the dials of [Music Assistant Controller and X-Air Controller](#works-with-other-plugins-deckbus).

- **One effect per row:** in the settings window under **Panorama**, choose the effect; it applies to all dials of the deck at once, whichever plugin they belong to. **No effect** switches it off for the row.
- **Which dials take part:** a small map shows the deck's dials with their plugin and name, each with a tick. A dial without the tick shows no effect, but the effect runs on behind its neighbours without a break. To read a value at a glance, untick its dial.
- **Settings** (speed, density, colours) are set once for the row.
- **From Home Assistant** (section **Panorama from Home Assistant**): the effect takes the colour of the dial's own lamp, or of any entity (a lamp, a text helper with "#FF8800", "255,136,0" or "red", an attribute); speed and density can follow number entities, and an entity's value (e.g. power ÷ its maximum) can move the effect as music does. Values from Home Assistant win over the colours chosen in the Panorama section.

*How it works:* the plugins agree on the row's effect over deckbus (the latest choice wins); the plugin with the leftmost dial computes the effect and sends the others their part.

## Connecting to Home Assistant

Set up once in **Connections** (in the settings window; the short panel shows the connection in one line).

- **Address:** a host (`192.168.1.20` means `http://192.168.1.20:8123`) or a URL with `http://` or `https://`. **Search the network** finds Home Assistant when it announces itself (zeroconf); over a VPN that usually fails, so type the address.
- **Token:** a long-lived access token. In Home Assistant, open your profile → **Security** → **Long-lived access tokens** → **Create token**, and paste it here.

HA-C reconnects on its own. A refused token shows as "Token refused"; HA-C then stops trying until you change the token or press **Connect**.

*How it works:* HA-C uses Home Assistant's WebSocket API (as HA's own frontend does): it follows every entity's state, reads the area, device, entity and label registries for the device list, and calls services. States are written with HA's own texts (`frontend/get_translations`) in Stream Deck's language.

## Connecting to your MQTT broker

All HA-C keys share one broker, set up in **Connections**. You only need it for devices that aren't in Home Assistant, or to talk to them directly.

- **Address:** a host (`192.168.1.10` means `mqtt://192.168.1.10:1883`) or a URL with `mqtt://`, `mqtts://` (TLS), `ws://` or `wss://`.
- **User name and password**, if your broker needs them. **Allow self-signed certificates** for TLS with your own certificate.

**Setting up a key by topic** (Topic by hand):

1. Find the **state topic**: **type** part of it ("lamp") to see every matching topic with its current value, **browse** all topics as a tree, or **listen**: press it, then switch the device by hand within 10 seconds; HA-C lists the topics that changed.
2. If HA-C recognises the device, it offers to **fill in the rest**: where commands go, the JSON field, the on/off values, the availability topic. Recognised: zigbee2mqtt, Tasmota, Shelly (Gen1 and Gen2+), ESPHome, topics ending in `/state`.
3. For JSON payloads, click the **field** that holds the state; HA-C shows the current value of each.
4. **Test:** "Switch once" switches the device and shows whether it confirmed, or what was sent and what came back.

Command topic, payload templates like `{"state":"{value}"}`, retain and QoS can be changed by hand under **Advanced**.

## Home Assistant or MQTT?

Both work for every action; a key uses one of them (its **source**).

- **Home Assistant** is the simpler choice for everything HA knows: entities by room, HA's names, icons and state texts, ranges and modes come along, and scenes, scripts and automations run.
- **MQTT** talks to the device directly, without going through HA: useful for devices HA doesn't have, when HA is down, or for very fast feedback. Devices that announce themselves through **MQTT discovery** (zigbee2mqtt, Tasmota, ESPHome, AWTRIX and many others) are set up just as easily.
- *zigbee2mqtt and `/get`:* zigbee2mqtt only sends a device's state when it changes. When a Switch key appears, HA-C asks for the current state on `…/get` (only reading), so the key doesn't wait for the next change.
- *Availability:* a device that reports itself offline (its availability topic, or "unavailable" in HA) is shown dimmed with a red cloud. HA-C follows what the device's discovery says; if availability is switched off for it, there is nothing to follow.

## Works with other plugins (deckbus)

HA-C is part of a family of Stream Deck plugins (Music Assistant Controller, X-Air Controller, System Audio Controller) that talk to each other through **deckbus**, a small local bus (see the [protocol](https://github.com/rocklobster42195/streamdeck-kit/blob/main/docs/deckbus-protocol.md)).

- **Offers:** whether Home Assistant or the MQTT broker is reachable (`status`), where HA-C's keys and dials are (`actions`), the Panorama row it knows (`panorama-rows`), and its part of a shared Panorama.
- **Uses:** the Panorama of the other plugins' dials in the same row: one effect across all of them, with colours and levels from each.
- **Only with your permission:** ticking or unticking a dial of another plugin in the Panorama map asks that plugin to change it.

HA-C works the same without other plugins.

## Troubleshooting

- **The key says "Set up …":** pick a device in its settings, or set up a connection first.
- **"Token refused":** create a new long-lived access token in Home Assistant and paste it in Connections.
- **An entity isn't in the device list:** check that it isn't hidden or disabled in Home Assistant, and that it fits the action (a sensor won't show for the Switch key). Search by its entity ID to be sure.
- **"Access denied" (MQTT):** check user name and password; Mosquitto refuses anonymous logins by default.
- **The key stays on a question mark:** no known value has arrived yet. With MQTT, check the field and the on/off values; "Now: …" under the topic shows what arrived.
- **The key goes back after 3 seconds:** the device didn't confirm. With MQTT, check the command topic (zigbee2mqtt needs `…/set`).
- **The settings window stays empty:** close it and open it again; if it stays empty, restart Stream Deck.

## Planned

- **The deck as a device in Home Assistant:** key presses as events for automations, messages shown on the deck, a night mode, the Panorama as a light in HA.
- **Cover colour:** keys that take the colour of what is playing in Music Assistant as their "on" colour.

## Development

```
npm install
npm run check         # build, tests, lint, manifest check
npm run sim:switch    # Switch keys against an in-process broker with invented devices
npm run sim:value     # Value keys in both looks with colour ranges
npm run sim:keys      # Trigger (with confirmation) and Multi-state keys
npm run sim:dial      # Slider dials: a lamp, a thermostat, a blind
npm run sim:discovery # MQTT discovery: pick a device, the key and dial work
npm run pi:preview    # the settings pages in a browser, with invented data
npm run watch         # rebuild and restart the plugin in Stream Deck
```

HA-C is built on [`@rocklobster42195/streamdeck-kit`](https://github.com/rocklobster42195/streamdeck-kit), linked from a local checkout next to this one until it is on npm.

## Credits and licence

- Home Assistant: [home-assistant-js-websocket](https://github.com/home-assistant/home-assistant-js-websocket) (Apache 2.0); network search: [bonjour-service](https://github.com/onlxltd/bonjour-service) (MIT).
- MQTT: [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT); tests use [Aedes](https://github.com/moscajs/aedes) (MIT).
- Icons: [Material Design Icons](https://pictogrammers.com) (Apache 2.0).
- HA-C: MIT licence, © 2026 Boris Kemper.
