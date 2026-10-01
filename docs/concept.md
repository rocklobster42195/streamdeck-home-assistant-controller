# Home Assistant Controller (HA-C): Concept

Status: the MQTT side was agreed on 2026-09-26 as MQ-C (MQTT Controller) and built on 2026-10-01 (v1 actions, topic help, MQTT discovery, deckbus). On 2026-10-01 MQ-C and the planned HA-C were merged into **one plugin, Home Assistant first, MQTT as the second source** ([`notes/2026-10-01-ha-c-merge-grill.md`](../notes/2026-10-01-ha-c-merge-grill.md)). The HA source is next; its ideas are in [`docs/ideas.md`](ideas.md). The MQTT decisions and their reasons are in [`notes/2026-09-26-mqtt-controller-grill.md`](../notes/2026-09-26-mqtt-controller-grill.md).

## What it is

A Stream Deck plugin that controls and shows your smart home: **Home Assistant** entities through its WebSocket API, and anything on an **MQTT broker**, also without Home Assistant (ioBroker, Node-RED, Tasmota or zigbee2mqtt on their own). Every key has a source: an HA entity or an MQTT topic. Users with only one of the two set up only that one. It is meant for the Elgato Marketplace, free, as an unofficial community plugin.

What sets it apart:
- **Looks and settings in MA-C quality:** any Material Design icon per state, colours, colour ranges, half-circle gauges, a Slider dial with setpoint and actual value, a connection card. All from the shared kit.
- **No typing:** pick "Living room light" by area and device (HA), or from MQTT discovery; for plain MQTT a live topic search, recognised schemes, Browse and Listen.
- **MQTT as a second source:** JSON fields by click, publish templates, works straight on the broker.

The existing Home Assistant plugin by Christoph Giesche is free and widespread but plain (generic dials, keys with an icon and two lines); HA-C competes on looks, gauges and MQTT.

## Identity

| | |
|---|---|
| Display name | **Home Assistant Controller**, public short name **HA-C** (internally HAC; pattern <system>-C) |
| UUID | `de.boriskemper.ha-controller` (MQ-C's `de.boriskemper.mqtt-controller` was never public) |
| Repository | `rocklobster42195/streamdeck-ha-controller`, private until release |
| Folder | `C:\dev\ha-controller` (moved from `C:\dev\mqtt-controller` with its history on 2026-10-01) |
| Logo | the Rocklobster lobster on **Endeavour `#005DA0`** from the house palette |
| Disclaimer | unofficial; not affiliated with Elgato or Home Assistant / the Open Home Foundation; no third-party logos |

## Home Assistant source (next)

Decided in the merge grill (Q4):
- Connection: URL + long-lived token; the connection card finds HA through zeroconf (`_home-assistant._tcp`). WebSocket API via `home-assistant-js-websocket`: subscribe to states, call services, read areas and devices.
- The same five actions, a source per key. Switch: `light`, `switch`, `input_boolean`, `fan`, `lock` … (toggle). Value: `sensor`, `binary_sensor`, any state or attribute. Publish/trigger: `scene`, `script`, `button`, `automation`. Multi-state: `select`, `input_select`, fan speeds. Slider: brightness, `climate` (target + current), `cover` position, `number`/`input_number`.
- One device picker by area and device with HA's names and icons, listing HA entities, MQTT-discovery devices and "topic by hand", each with a badge for its source.
- Later: colour temperature/colour on the dial, sparkline, camera snapshot, key events to HA (`ha_c_key_pressed`), the deck as an HA device (JSA mini-integration), the JSA key (see `docs/ideas.md`).

The sections below describe the MQTT source as built.

## Actions in v1

| Action | Device | Behaviour |
|---|---|---|
| **Switch** | Key | Toggles between two values (e.g. `ON`/`OFF`) and shows the state. For lights and plugs. |
| **Trigger** (was Publish; UUID `…publish` kept) | Key | Runs something once: an HA scene, script, button or automation, or a fixed MQTT value or JSON, e.g. opening a gate. |
| **Value** | Key | Shows a value with its unit (temperature, power). Colors change at thresholds, e.g. red from 25 °C. |
| **Multi-state** | Key | Steps through a list of values (fan 1 → 2 → 3 → off) and shows the current one. |
| **Slider** | Dial | Rotate to set a value (brightness, setpoint, blind position) with a ring like MAC's Volume dial; push toggles on/off. |

Later: a Value dial with a sparkline.

**Slider looks (added 2026-10-01):** the Slider dial offers a choice of looks: the **ring** (as MAC's Volume dial) or a **half-circle gauge**:
- custom colour ranges on the arc (e.g. blue below 18, green to 22, red above), set with `pi-thresholds`;
- a **target marker** for the value the dial sets (setpoint), and the **actual value** as the filled arc;
- for this the Slider gets an optional second topic, the **actual value** (e.g. the room temperature), next to the setpoint's state and command topics. Without it, the arc shows the setpoint.
- Example thermostat: rotating moves the marker to 21.5 °C, the arc shows 19.8 °C, the text shows the actual value large and the setpoint small.
- Home Assistant `climate` entities map onto it (`current_temperature_topic`, `temperature_state_topic`, `temperature_command_topic`, `min_temp`, `max_temp`, `temp_step`).
- The gauge goes into the kit (`render/gauge/half-arc`), so other plugins can use it.
- The **Value key** offers the half-circle too, display only (temperature, power), with the same colour ranges (decided 2026-10-01).

**Icons:** every action uses the kit's MDI icon picker (`pi-icon-picker`, catalog `/mdi`): one icon per state for Switch, one per value for Multi-state, one for Value and Publish. If Home Assistant discovery brings an `icon` (`mdi:lightbulb`), it becomes the default.

Every action shows an **offline** look when the broker is disconnected, or when the device reports itself unavailable through its availability topic.

## Finding devices and topics

- **Topic browser** in the settings panel: a live tree of all topics with their current values and a search field. Clicking a topic takes it.
- **Home Assistant MQTT discovery** (`homeassistant/+/+/config`, also with a node id): devices appear by name, with state and command topic, on/off values, unit, range and availability. zigbee2mqtt and Tasmota can announce their devices in this format as well (zigbee2mqtt does by default when used with Home Assistant).
- Discovered entities map onto the v1 actions: `switch`/`light` → Switch · `sensor`/`binary_sensor` → Value · `button`/`scene` → Publish · `select` → Multi-state · `number` and light brightness → Slider · `climate` → Slider with the half-circle gauge. Picking a device in an action's settings offers only the entities that fit that action.
- Reality check on the test broker (2026-09-26): 719 topics, 715 of them retained (the browser is complete almost at once), 621 JSON payloads, and 506 Home Assistant discovery configs for 61 devices with 185 controllable entities (zigbee2mqtt, Shelly, AWTRIX, JS Automations, …).
- Later: native zigbee2mqtt (`zigbee2mqtt/bridge/devices`) and Tasmota (`tasmota/discovery/…`) discovery for setups without the Home Assistant format; shareable **device templates** (small JSON presets per device type, e.g. "Shelly Plus 1", contributed via pull request).

## Payloads

- **Reading:** plain text is taken as it is. For JSON you pick a field; the settings panel shows the current payload, and clicking a field takes its path (nested paths like `color.x` work).
- **Topics:** every action has a **state topic** and a **command topic**. The command topic defaults to the state topic (zigbee2mqtt needs `…/set`). Devices from discovery fill in both.
- **On/off values** are free text (`ON`/`OFF`, `true`/`false`, `1`/`0`) and compared case-insensitively.
- **Publishing:** a plain value or a template, e.g. `{"state":"{value}"}` or `{"brightness":{value}}`.
- **Topic help (added 2026-10-01):** most people don't know which topic reports the state and which one takes the command. The settings panel helps in three ways:
  - **Known schemes:** when the state topic is picked, MQC recognises the scheme and fills the command topic, the payload and the availability topic. The user sees a badge with the scheme ("zigbee2mqtt") and can change everything.

    | Scheme | State | Command | Availability |
    |---|---|---|---|
    | zigbee2mqtt | `zigbee2mqtt/<name>` (JSON) | `zigbee2mqtt/<name>/set` (`{"state":"ON"}`) | `zigbee2mqtt/<name>/availability` |
    | Tasmota | `stat/<t>/POWER`, `tele/<t>/STATE` | `cmnd/<t>/POWER` | `tele/<t>/LWT` |
    | Shelly Gen1 | `shellies/<id>/relay/<n>` | `shellies/<id>/relay/<n>/command` | `shellies/<id>/online` |
    | Shelly Gen2+ | `<prefix>/status/switch:<n>` (JSON `output`) | `<prefix>/command/switch:<n>` (`on`/`off`/`toggle`) | `<prefix>/online` |
    | ESPHome | `<node>/<component>/<name>/state` | `<node>/<component>/<name>/command` | `<node>/status` |
    | Generic | `…/state`, `…/status` | `…/set`, `…/command` | — |

    Home Assistant discovery fills all of this anyway; the schemes are for devices without it.
  - **Listen:** the user presses "Listen" and operates the device by hand or in its app; the panel lists the topics that changed in that time, and a click takes one as the state topic. Read-only.
  - **Test:** a button sends the command once and shows whether the state topic answered within 3 s ("confirmed" or "no answer: check the command topic"). It is sent only on that explicit click.
- **Optimistic display:** after a press the key shows the new state at once and reverts if the device does not confirm within 3 s (as in MAC).
- **Retain** off and **QoS** 0 by default; both can be changed under "Advanced".

## Broker connection

- **One broker for the whole plugin**, stored in Stream Deck's global settings and set up through a connection card in every settings panel (as in MAC). Several brokers come later.
- The address is a URL: `mqtt://`, `mqtts://` (TLS), `ws://`, `wss://`. A bare host means `mqtt://host:1883`.
- Username and password, plus an "allow self-signed certificates" option. Client certificates come later.
- The client id is generated once (`mqc-<random>`) and kept, so the broker recognises the plugin.
- MQTT 3.1.1 and 5 (the `mqtt` package supports both).
- Reconnects on its own with a growing delay. Keys are greyed out while disconnected; a rejected login says so clearly ("access denied").

## Settings window (tested 2026-10-01)

The property inspector can open its own window with `window.open("x.html", name, "width=…,height=…")` from a click: a page from the plugin folder (`file://…/ui/`), no web server. The window reaches the PI through `window.opener` (direct calls and `postMessage`), and so the PI's Stream Deck connection: it can read and write the key's and the global settings and ask the plugin anything the PI can. Tested on Windows in Stream Deck; macOS not yet.

The window **closes with the PI** (another key clicked, Stream Deck closed). Settings are saved on every change, so nothing is lost; the window just belongs to one key's settings.

Idea (to be decided): the PI stays short (device, name, icon, "More settings …"), the window holds the roomy parts (device picker by area, colour ranges, value lines and attributes, MQTT details, the connections). Fallback without the window: collapsed sections, MQTT parts hidden while no broker is set up. A candidate for the kit, as the whole family has long PIs.

## Shared code: the kit

MQC is built on **`@rocklobster42195/streamdeck-kit`** (repository `rocklobster42195/streamdeck-kit`; the name leaves out "plugin", decided 2026-09-28), published to npm the same way as `music-assistant-client`. The kit is carved out of MAC **before** MQC is built, and MAC is switched over to it. Sonos Controller follows so that the kit bus can be tested between SC and MAC (decided 2026-09-28).

What goes into the kit:
- everything in MAC's `packages/streamdeck-core`: settings panel building blocks (section, toggle, range, choice tiles, color, field), i18n, the Stream Deck client of the settings panel, marquee, animation, title fader, text widths, PNG, and the **Panorama effects**;
- from MAC's settings panel: icon picker, select, key preview, and the skeleton of the connection card (status, address, login);
- from MAC's plugin: the MDI icon catalog, the plugin ↔ settings panel bridge (option lists, preview), key image and dial strip rendering (ring, scrims), glide, color fade, frame ticker, optimistic store, latest-value sender, alarm timers, volume fade.

Everything specific to Music Assistant stays in MAC. Files that mix both (e.g. `key-image.ts`, `pi-bridge.ts`) are split while moving.

### Added 2026-09-27 (from the X-Air Controller grill)

These additions come from the XAC grill: `C:\dev\xair-controller\notes\2026-09-27-xair-controller-grill.md`, Q15–Q20.

- **Gauge family** `render/gauge/`, built during the carve-out, because MQC needs it for Value and Slider:
  - `scale` maps a value to a position (linear, dB or log, with ticks and labels);
  - `zones` holds thresholds and their colors;
  - `bar` (horizontal or vertical, stereo), `arc` (MAC's volume ring moves onto it with no visible change), `pie` and `sparkline` draw the gauges;
  - `pie` is the "Torte" exactly as SC uses it (`generateFaderSvg` in SC `src/utils/icons.ts`, Volume Pie dials): outline circle, filled wedge clockwise from 12 o'clock, mute icon instead of the wedge. Added 2026-09-28 next to the ring, so SC can move onto the kit;
  - `peak` holds the peak-hold and clip logic.

  There are no needle gauges.
- **Input:** dial acceleration and catch points (e.g. at 0 dB), and press gestures: tap, arm then confirm, long press. There is also an offline look and a global frame budget (an fps cap, with redraws only when something changed).
- **New color picker** `<pi-color>` replaces the native input field. It keeps the same API and adds an `auto` attribute. It opens a popover with:
  - "Auto / from device", stored as `"auto"`;
  - the house palette from `C:\dev\komuh\docs\cd-farben.md`;
  - 8 recent colors;
  - an HSV field, a hue slider and a hex field, without alpha.

  The key preview updates while dragging, and the color is saved on release.
- **Settings panel components**, one file each:
  - `pi-select` (from `mac-select`): group headers, color dots or icons per entry, a search field from ~15 entries;
  - `pi-override`: "from device" or "custom" for name, color and icon;
  - `pi-number`: unit, dB formatting including −∞, scroll to change;
  - `pi-thresholds`: value → color stops with a live gauge preview;
  - `pi-connection-card`: status, address and login, plus a discovery slot and a hint line;
  - a **styleguide page** in the settings preview.
- **Dev kit:** a second package in the same repository, `@rocklobster42195/streamdeck-dev-kit`, used as a devDependency and part of the carve-out. Its CLI `sdkit` offers `sim`, `pi-preview`, `screenshot`, `pi-shots`, `store-assets`, `translate` (including the unused-keys check) and `version|release|pack`. `puppeteer-core` is needed only here. Scenarios and fakes stay in each plugin and hook in through `sdkit.config.mjs`. The two packages are versioned together.
- **Kit bus "deckbus"** (grilled on 2026-09-28; details in `C:\dev\streamdeck-kit\notes\2026-09-28-kit-bus-grill.md`): Stream Deck has no API for plugins to talk to each other, so the kit brings its own bus. It is **deliberately open**: any plugin, and even local apps, can join through a protocol spec (`docs/deckbus-protocol.md` in the kit repo), without our kit and in any language.
  - **No master, a mesh:**
    - Every plugin opens its own pipe or socket in one of 16 slots and connects directly to the others.
    - There is no election and no state that is lost with a peer: each plugin owns its soft state and sends it again after every reconnect.
    - Versions are negotiated per pair.
    - Coordination tasks (frame budget, leftmost-dial Panorama) follow a fixed rule, such as the lowest live id. This comes later.
    - MQC and HA-C are the exception: by their role (home automation) they act as masters for what they control.
  - **Transport and messages:**
    - Windows `\\.\pipe\deckbus-<userhash>-<slot>`, macOS `deckbus-<slot>.sock`.
    - NDJSON. The hello carries the bus key from `%APPDATA%\deckbus\key`, which keeps other users out.
    - Four kinds of message: state, stream (subscribers only), request/reply and broadcast.
    - Shared names (`meters/…`, `duck`, `alert`, `status`) plus UUID-prefixed private ones.
    - Anyone may read; writes only from senders the receiver explicitly allows.
    - The bus is always on; a failing bus never stops a plugin.
  - **First test: MAC ↔ XAC, not SC** (SC is in production):
    1. presence
    2. meters from XAC drive MAC's Panorama, subscribed only while a consumer is visible
    3. ducking, as a lease that restores itself
  - Shared state: a volatile key-value store plus `%APPDATA%/rocklobster/shared.json`.
  - Cross-plugin Panorama: the plugin with the leftmost dial renders the effect and streams background slices to the others.

  Every plugin keeps working on its own.

  Uses of the bus, agreed 2026-09-27 (the user: "HAMMER!"):
  - **Audio-reactive Panorama:** XAC puts meter levels on the bus (e.g. the Sonos channel or Main LR), and the Panorama effects in MAC move with the real music.
  - **Ducking during announcements:** MAC's Announcement key lowers the Sonos channel on the mixer through XAC and raises it again afterwards.
  - **Shared frame budget:** all plugins share the USB bandwidth to the Stream Deck, so a coordinator on the bus splits the fps budget between them.
  - **Alert overlay across the deck:** a plugin asks all the others to show a short overlay (doorbell, print finished, mixer offline). Each plugin draws the overlay on its own keys.

  Later:
  - **Cross-plugin scene key:** each plugin announces its actions on the bus; one key runs actions in several plugins.
  - **Deck-wide night mode or screensaver.**
  - **Suite status key:** all connections at a glance.
  - **Shared settings:** recent colors and icons, accent theme, one backup file for all plugins.

  Left out: transition animations across the deck, and MQC as an MQTT gateway for the other plugins.

  Guard rails:
  - Every plugin works alone.
  - The protocol version is negotiated.
  - The pipe is open only to the current Windows user.
  - Actions that write (such as ducking) must be allowed explicitly in both plugins.

## deckbus in v1

Decided 2026-10-01: MQ-C joins deckbus from v1 with `status` (broker reachable, its address) and `actions` (where its keys are). It offers no streams or requests yet; ideas for later are in the kit bus section above (alert overlay, e.g. the doorbell).

## Backup and templates

Decided for the whole plugin family on 2026-10-01 (kit notes `C:\dev\streamdeck-kit\notes\2026-10-01-backup-grill.md`): Stream Deck's profile export keeps the layout; the kit backs up connections and plugin data (one file, all plugins over deckbus, secrets encrypted on request) and offers templates (one key's settings without a place, no secrets). MQ-C is the first plugin to use it; its planned device templates become templates shipped with the plugin.

## Testing

- **Simulator** with a broker running inside the test (`aedes`) and invented devices announced through Home Assistant discovery: a lamp with brightness, a temperature sensor, a fan with levels, a gate. This covers keys, dials, discovery and the Marketplace screenshots without touching a real home.
- **Settings panel preview** without Stream Deck, against the test broker (like MAC's `pi:preview`).
- Against the **real broker** only with own test topics under `mqc/test/…`. Real devices are never switched without asking.

## Conventions

As in MAC: English and German UI (one locale file per language), English code comments, small focused files, logic separate from rendering, one settings component per file, README for end users first, CHANGELOG kept current, unofficial-plugin disclaimer, no Elgato or third-party logos.

## Planned layout

```
docs/                                 concept, later Marketplace material (local)
notes/                                grill notes, working notes (local)
src/
  plugin.ts                           entry point, registers the actions
  actions/                            one file per action (switch, publish, value, multi-state, slider)
  mqtt/                               broker connection, subscriptions shared by topic, payload reading/templates
  discovery/                          topic tree, Home Assistant discovery
  pi-ui/                              MQC-specific settings components (topic browser, JSON field picker, device picker)
de.boriskemper.mqtt-controller.sdPlugin/
  manifest.json, en.json, de.json
  ui/                                 one settings page per action
  imgs/                               plugin and action icons
tools/
  sd-sim/                             simulator scenarios with the in-process broker
```

## Order of work

Decided 2026-09-27: first the **MAC go-live**, then XAC or MQC (which one comes first is still open). The kit carve-out comes before whichever plugin is next.

Updated 2026-09-28 (kit bus grill): MAC goes public on **GitHub first**, the Marketplace later. The kit comes next; the carve-out, the gauges with the pie and the PI parts are already done. Then **XAC**:

1. `xair-client`
2. XAC minimal on the kit
3. the bus core in the kit
4. the bus in XAC and MAC
5. ducking

SC stays off the bus for now. MQC comes after XAC.

1. Carve out `streamdeck-kit` from MAC (own repository, npm with Trusted Publishing) and switch MAC to it.
2. Set up MQC on the kit: manifest, broker connection, connection card, simulator with `aedes`.
3. Switch and Value keys, then Publish and Multi-state, then the Slider dial.
4. Topic browser, then Home Assistant discovery.
5. Settings preview, screenshots, README, Marketplace.

## Open points

- Test broker: a standalone Mosquitto (own VM or container) at the address in `.env`; it may move later. Credentials in `.env`. Home Assistant is connected to it, so real Home Assistant discovery can be tested read-only there.
- Real-device test (agreed 2026-10-01, waits until the user is at home; the user switches, only after saying so): Switch on Sonoff S20 `sonoff/0/S20/POWER` (topic by hand, `true`/`false`; replaces the last old prototype key at 0,1) and TV_Leiste or Deckenfluter_HZ via the discovery picker; Value on the MH-Z19 CO₂ sensor or a temperature sensor; Slider on Ikea_TV (0–254 → %); Multi-state on Stern → Effect; Publish on a harmless scene the user picks. Off limits: washing machine, dishwasher, dehumidifier, Tedee lock, watering valves, WLAN switches, permit join, heating mode.
