# MQ-C — MQTT Controller for Stream Deck

Switch and show anything on your MQTT broker from your Stream Deck: lights and plugs from zigbee2mqtt, Tasmota, Shelly or ESPHome, devices from Home Assistant, ioBroker or Node-RED. You don't need to know topic names by heart: MQ-C searches every topic on your broker as you type and recognises common devices, so most keys are set up with a few clicks.

> Unofficial community plugin. Not affiliated with Elgato.

**Status:** early. The Switch key works; more actions follow (see [Planned](#planned)).

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

- **Value** key (temperature, power, with colours at thresholds), **Publish** key (scenes, a gate), **Multi-state** key (fan 1 → 2 → 3 → off), **Slider** dial (brightness, setpoint).
- A **half-circle gauge** for the Slider dial and the Value key: colour ranges, a marker for the setpoint and the actual value as the arc, e.g. for a thermostat.
- **Home Assistant MQTT discovery:** pick "Living room light" instead of a topic.
- A topic **browser** (tree), **Listen** (operate the device and see which topic changes) and **Test** (send once and see whether the device answers).

## Development

```
npm install
npm run check        # build, tests, lint, manifest check
npm run sim:switch   # Switch keys against an in-process broker with invented devices
npm run watch        # rebuild and restart the plugin in Stream Deck
```

MQ-C is built on [`@rocklobster42195/streamdeck-kit`](https://github.com/rocklobster42195/streamdeck-kit), linked from a local checkout next to this one until it is on npm.

## Credits and licence

- Icons: [Material Design Icons](https://pictogrammers.com) (Apache 2.0).
- MQTT: [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT); tests use [Aedes](https://github.com/moscajs/aedes) (MIT).
- MQ-C: MIT licence, © 2026 Boris Kemper.
