# HA-C — Home Assistant Controller for Stream Deck

Switch and show your smart home on your Stream Deck: lights, plugs, sensors, scenes, thermostats. HA-C works with **any MQTT broker** today — devices from zigbee2mqtt, Tasmota, Shelly or ESPHome, from Home Assistant through its MQTT discovery, ioBroker or Node-RED. With a direct **Home Assistant** connection, Switch and Value keys show your HA entities, picked by room; the other actions follow. You don't need to know topic names by heart: pick a device, or let HA-C search and recognise your topics.

> Unofficial community plugin. Not affiliated with Elgato or Home Assistant / the Open Home Foundation.

**Looking for something simpler?** If you only use Home Assistant and want a lean, proven plugin, have a look at the [Home Assistant plugin by cgiesche](https://github.com/cgiesche/streamdeck-homeassistant): it has been around for years and does the basics very well. HA-C's focus is different: Home Assistant and MQTT side by side, gauges and dials, and working together with the other plugins of its family.

**Status:** early. All actions work with MQTT: Switch, Value, Trigger and Multi-state keys and the Slider dial. All keys and the Slider dial also work with Home Assistant entities.

## Contents

- [Actions](#actions)
- [Setting up a key](#setting-up-a-key)
- [Connecting to Home Assistant](#connecting-to-home-assistant)
- [Connecting to your MQTT broker](#connecting-to-your-mqtt-broker)
- [Works with other plugins (deckbus)](#works-with-other-plugins-deckbus)
- [Troubleshooting](#troubleshooting)
- [Planned](#planned)
- [Development](#development)
- [Credits and licence](#credits-and-licence)

## Actions

### Switch *(key)*

Switches a light, plug or anything else with two states, and shows the state the device reports.

- **On:** the icon in its colour (Yellow Sea by default) with a soft glow. **Off:** grey.
- After a press the key shows the new state at once. If the device doesn't confirm within 3 seconds, it goes back, so the key never shows something that didn't happen.
- **Offline:** dimmed with a red cloud, while the broker isn't reachable or the device reports itself unavailable.
- A question mark means HA-C hasn't received a known value yet.
- Pick any icon from the Material Design Icons for on and off, a colour and a name.
- Without a state topic (a gate that reports nothing), the key sends on and off by turns.
- **On/off values are recognised:** `ON`/`OFF`, `true`/`false`, `1`/`0` and `open`/`closed` work without setting anything, and the key answers in the same words the device uses. Set your own values only for anything else.
- **Value line (optional):** a second topic shown under the icon, e.g. the plug's power "42 W". With colour ranges, the icon takes the colour of the range the value is in while on (green, red from 1000 W).

### Value *(key)*

Shows a value with its unit: a temperature, power, humidity, a door's state.

- **Text:** the value large, the unit below, the name at the top, optionally with an icon.
- **Half circle:** a gauge between minimum and maximum, the value inside it.
- **Colours:** a base colour and as many ranges as you like ("from 25 °C: red"). In the half circle, the ranges show as bands and the arc takes the colour of the range the value is in. A bar in the settings previews them.
- Decimals as the device sends them, or rounded to a number you choose. Text that isn't a number ("open") shows as it is.
- Offline look like the Switch key; a dash until the first value arrives.
- **On press** (optional): **Switch** something on and off, e.g. the plug whose power the key shows; the key gets a frame while it is on. Or **Send** a fixed payload to a topic, e.g. a heating boost.

### Trigger *(key)*

Runs something once on every press: a Home Assistant scene, script, button or automation, or a fixed MQTT payload (a scene, opening a gate, a JSON command). The key confirms with a check mark. (Called "Publish" in earlier versions.)

- **With Home Assistant:** pick a scene, script, button or automation. *How it works:* scenes and scripts are started with `scene.turn_on` / `script.turn_on`, buttons are pressed with `button.press` / `input_button.press`, automations run with `automation.trigger` (this skips their conditions, as "Run" in HA does). The check mark means HA accepted the call; a script that keeps running (e.g. waiting for a door) runs on in HA.
- **Ask before sending:** the first press arms the key for 3 seconds (it turns into "Press again"), only a second press sends. For a gate, an alarm, anything you don't want to trigger by accident.
- Icon, colour and name of your choice.

### Multi-state *(key)*

Steps through a list of values on every press, e.g. a fan off → 1 → 2 → 3 → off, a mode or a list of scenes, and shows the one the device reports.

- Each state has its value, a name, an icon and a colour. Dots under the name show where you are in the list.
- "Add 'low'" takes the value the device reports right now into the list.
- The next state shows at once and goes back if the device doesn't confirm within 3 seconds. A value that isn't in the list shows as it is, with a question mark.
- **With Home Assistant:** pick a *select* or *input select* (a heating mode, a camera's day/night mode, a list of scenes). Its options become the states, each with a colour; give them names and icons, or remove the ones the key should skip: a press then jumps to the next one left in the list. *How it works:* HA-C calls `select.select_option` (or `input_select.select_option`) with the next option and shows the state HA reports back.

### Slider *(dial, Stream Deck + only)*

Sets a value by turning: a lamp's brightness, a thermostat's setpoint, a blind's position.

| Control | What it does |
|---|---|
| Rotate | Change the value by the step you set (e.g. 10 for brightness, 0.5 for a thermostat) |
| Push / tap the display | Nothing, switch something on and off, or send a payload (your choice) |

- The display follows at once; the device gets the latest value at most every 150 ms, so fast turning doesn't flood it. Without a confirmation within 3 seconds, the dial goes back to what the device reports.
- **Half circle** (with colour ranges) or **Ring**.
- **Thermostat:** with an actual-value topic (the room temperature), the arc shows the actual value large, and a marker and "→ 21.5 °C" show the setpoint. While you turn, the setpoint is shown large.
- **Light:** rotate for brightness, push to switch on and off; while the light is off, the dial is dimmed and shows "Off".
- **In percent:** devices count brightness differently (zigbee2mqtt 0–254, Homematic 0–255, others 0–100). Enter the device's range as minimum and maximum and switch on "Show in percent": the dial shows 0–100 % and sends in the device's range.
- **With Home Assistant:** pick a light, fan, cover, thermostat or number. Range, step and unit come from HA, so there is nothing to set up. *How it works:* a light turns its brightness in percent (`light.turn_on` with `brightness_pct`; 0 % switches it off), a fan its speed (`fan.set_percentage`), a cover its position (`cover.set_cover_position`); a push switches them on and off (open and close). A thermostat turns its setpoint (`climate.set_temperature`) within HA's limits and steps, and the arc shows the room temperature. `number` and `input_number` entities use `set_value` with their own range. A step of your own (e.g. 1 %) replaces HA's.

## Setting up a key

**With Home Assistant:** if your devices announce themselves through Home Assistant's MQTT discovery (zigbee2mqtt does by default, as do Tasmota, ESPHome, AWTRIX and many others), the settings start with **Home Assistant device**. Search "living room", pick the entity, done: topics, values, JSON fields, availability, its icon and name are filled in. Each action lists only what fits it: lights and switches for the Switch key, sensors for Value, buttons and scenes for Trigger, selects for Multi-state, numbers, light brightness and thermostats for the Slider dial. A light on the Slider dial is set up in percent, with push switching it on and off.

**Without discovery** (or to fine-tune):

1. Find the **State topic** in one of three ways:
   - **Type** part of it, e.g. "lamp": the list shows every matching topic on your broker with its current value.
   - **Browse:** all topics as a tree, one level at a time, with their values.
   - **Listen:** press it, then switch the device by hand or in its app within 10 seconds. HA-C lists the topics that changed; the most likely first, topics that report all the time (power meters) greyed out at the end.
2. If HA-C recognises the device, it offers to **fill in the rest**: where commands go, the JSON field, the on/off values and the availability topic. Recognised today: zigbee2mqtt, Tasmota, Shelly (Gen1 and Gen2+), ESPHome, and topics ending in `/state`.
3. For JSON payloads, click the **field** that holds the state (e.g. `state`); HA-C shows the current value of each.

4. **Test** (Switch key, and the press action of Value and Slider): "Switch once" switches the device to the other state and shows whether it confirmed within 3 seconds, or what was sent and what the state topic says, so you know what to fix.

Everything can be changed by hand under **Advanced**: command topic, a payload template like `{"state":"{value}"}`, separate values to send, retain and QoS.

## Connecting to Home Assistant

HA-C connects to Home Assistant in the **Home Assistant** card at the bottom of every key's settings. Every key and the Slider dial can then use your HA entities (pick them under **Device**). Keys show the icon Home Assistant shows for the entity, and it changes with the state as in HA: a cloud or a sun for the weather, the level of a battery, a lock open or closed. *How it works:* HA-C asks HA for its icon tables (`frontend/get_icons`) once per connection and picks the icon as HA's own frontend does; an icon you set on the entity in HA wins, and one you pick on the key wins over that. States are written as HA writes them, in Stream Deck's language ("Bewölkt" rather than "cloudy"), from HA's own texts (`frontend/get_translations`); a state HA has no text for shows as it is, as in HA.

- **Address:** a host (`192.168.1.20` means `http://192.168.1.20:8123`) or a URL with `http://` or `https://`. **Search the network** finds Home Assistant when it announces itself (zeroconf); over a VPN that usually fails, so type the address.
- **Token:** a long-lived access token. In Home Assistant, open your profile → **Security** → **Long-lived access tokens** → **Create token**, and paste it here.

HA-C reconnects on its own. A refused token shows as "Token refused"; HA-C then stops trying until you change the token or press **Connect**.

You only need the sources you use: when one of them is set up, the other card folds away to one line.

## Connecting to your MQTT broker

All HA-C keys share one broker, set up in the **MQTT broker** card at the bottom of every key's settings.

- **Address:** a host (`192.168.1.10` means `mqtt://192.168.1.10:1883`) or a URL with `mqtt://`, `mqtts://` (TLS), `ws://` or `wss://`.
- **User name and password**, if your broker needs them.
- **Allow self-signed certificates**, for TLS with your own certificate.

HA-C reconnects on its own, waiting a little longer after each failed attempt. A wrong password shows as "Access denied"; HA-C then stops trying until you change the login or press **Connect**.

## Works with other plugins (deckbus)

HA-C is part of a family of Stream Deck plugins that talk to each other through **deckbus**, a small local bus (see the [protocol](https://github.com/rocklobster42195/streamdeck-kit/blob/main/docs/deckbus-protocol.md)).

- **Offers:** whether Home Assistant or the MQTT broker is reachable (`status`), and where HA-C's keys are on your deck (`actions`).
- **Uses:** nothing yet.
- **Only with your permission:** nothing yet.

HA-C works the same without other plugins.

## Troubleshooting

- **"Set up MQTT" on the key:** enter your broker's address in the MQTT broker card.
- **"Access denied":** check user name and password. Mosquitto refuses anonymous logins by default.
- **The key stays on a question mark:** the state topic hasn't sent a value HA-C knows. Check the field and the on/off values; "Now: …" under the topic shows what arrived.
- **The key goes back after 3 seconds:** the device didn't confirm. Check the command topic (zigbee2mqtt needs `…/set`).

## Planned



## Development

```
npm install
npm run check        # build, tests, lint, manifest check
npm run sim:switch   # Switch keys against an in-process broker with invented devices
npm run sim:value    # Value keys in both looks with colour ranges
npm run sim:keys     # Trigger (with confirmation) and Multi-state keys
npm run sim:dial     # Slider dials: a lamp, a thermostat, a blind
npm run sim:discovery # Home Assistant discovery: pick a device, the key and dial work
npm run pi:preview   # the settings pages in a browser, with invented topics
npm run watch        # rebuild and restart the plugin in Stream Deck
```

HA-C is built on [`@rocklobster42195/streamdeck-kit`](https://github.com/rocklobster42195/streamdeck-kit), linked from a local checkout next to this one until it is on npm.

## Credits and licence

- Icons: [Material Design Icons](https://pictogrammers.com) (Apache 2.0).
- MQTT: [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT); tests use [Aedes](https://github.com/moscajs/aedes) (MIT).
- HA-C: MIT licence, © 2026 Boris Kemper.
