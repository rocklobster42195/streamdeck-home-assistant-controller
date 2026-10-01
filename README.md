# MQ-C — MQTT Controller for Stream Deck

Switch and show anything on your MQTT broker from your Stream Deck: lights and plugs from zigbee2mqtt, Tasmota, Shelly or ESPHome, devices from Home Assistant, ioBroker or Node-RED. You don't need to know topic names by heart: MQ-C searches every topic on your broker as you type and recognises common devices, so most keys are set up with a few clicks.

> Unofficial community plugin. Not affiliated with Elgato.

**Status:** early. All v1 actions work: Switch, Value, Publish and Multi-state keys and the Slider dial.

## Contents

- [Actions](#actions)
- [Setting up a key](#setting-up-a-key)
- [Connecting to your broker](#connecting-to-your-broker)
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
- A question mark means MQ-C hasn't received a known value yet.
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

### Publish *(key)*

Sends a fixed payload on every press: a scene, opening a gate, a JSON command. The key confirms with a check mark.

- **Ask before sending:** the first press arms the key for 3 seconds (it turns into "Press again"), only a second press sends. For a gate, an alarm, anything you don't want to trigger by accident.
- Icon, colour and name of your choice.

### Multi-state *(key)*

Steps through a list of values on every press, e.g. a fan off → 1 → 2 → 3 → off, a mode or a list of scenes, and shows the one the device reports.

- Each state has its value, a name, an icon and a colour. Dots under the name show where you are in the list.
- "Add 'low'" takes the value the device reports right now into the list.
- The next state shows at once and goes back if the device doesn't confirm within 3 seconds. A value that isn't in the list shows as it is, with a question mark.

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

## Setting up a key

1. Start typing in **State topic**, e.g. "lamp". The list shows every matching topic on your broker with its current value. Click the right one.
2. If MQ-C recognises the device, it offers to **fill in the rest**: where commands go, the JSON field, the on/off values and the availability topic. Recognised today: zigbee2mqtt, Tasmota, Shelly (Gen1 and Gen2+), ESPHome, and topics ending in `/state`.
3. For JSON payloads, click the **field** that holds the state (e.g. `state`); MQ-C shows the current value of each.

Everything can be changed by hand under **Advanced**: command topic, a payload template like `{"state":"{value}"}`, separate values to send, retain and QoS.

## Connecting to your broker

All MQ-C keys share one broker, set up in the **Broker** card at the bottom of every key's settings.

- **Address:** a host (`192.168.1.10` means `mqtt://192.168.1.10:1883`) or a URL with `mqtt://`, `mqtts://` (TLS), `ws://` or `wss://`.
- **User name and password**, if your broker needs them.
- **Allow self-signed certificates**, for TLS with your own certificate.

MQ-C reconnects on its own, waiting a little longer after each failed attempt. A wrong password shows as "Access denied"; MQ-C then stops trying until you change the login or press **Connect**.

## Works with other plugins (deckbus)

MQ-C is part of a family of Stream Deck plugins that talk to each other through **deckbus**, a small local bus (see the [protocol](https://github.com/rocklobster42195/streamdeck-kit/blob/main/docs/deckbus-protocol.md)).

- **Offers:** whether the broker is reachable (`status`), and where MQ-C's keys are on your deck (`actions`).
- **Uses:** nothing yet.
- **Only with your permission:** nothing yet.

MQ-C works the same without other plugins.

## Troubleshooting

- **"Set up the broker" on the key:** enter your broker's address in the Broker card.
- **"Access denied":** check user name and password. Mosquitto refuses anonymous logins by default.
- **The key stays on a question mark:** the state topic hasn't sent a value MQ-C knows. Check the field and the on/off values; "Now: …" under the topic shows what arrived.
- **The key goes back after 3 seconds:** the device didn't confirm. Check the command topic (zigbee2mqtt needs `…/set`).

## Planned

- **Home Assistant MQTT discovery:** pick "Living room light" instead of a topic.
- A topic **browser** (tree), **Listen** (operate the device and see which topic changes) and **Test** (send once and see whether the device answers).

## Development

```
npm install
npm run check        # build, tests, lint, manifest check
npm run sim:switch   # Switch keys against an in-process broker with invented devices
npm run sim:value    # Value keys in both looks with colour ranges
npm run sim:keys     # Publish (with confirmation) and Multi-state keys
npm run sim:dial     # Slider dials: a lamp, a thermostat, a blind
npm run pi:preview   # the settings pages in a browser, with invented topics
npm run watch        # rebuild and restart the plugin in Stream Deck
```

MQ-C is built on [`@rocklobster42195/streamdeck-kit`](https://github.com/rocklobster42195/streamdeck-kit), linked from a local checkout next to this one until it is on npm.

## Credits and licence

- Icons: [Material Design Icons](https://pictogrammers.com) (Apache 2.0).
- MQTT: [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT); tests use [Aedes](https://github.com/moscajs/aedes) (MIT).
- MQ-C: MIT licence, © 2026 Boris Kemper.
