# MQTT Controller (relaunch): Grill / Discovery Notes
Date: 2026-09-26 · Goal: Decide what a new MQTT Stream Deck plugin in `C:\dev` should be, reusing MAC's PI (MDI icon picker, global settings), starting from the old internal project.
(Grill notes; the curated concept is `docs/concept.md` in `C:\dev\mqtt-controller`.)

## Summary / key decisions
- **Public Marketplace plugin**, a general MQTT plugin with first-class Home Assistant / zigbee2mqtt / Tasmota support.
- User's own setup: **Home Assistant** (ioBroker is being switched off step by step).
- **Positioning: pure MQTT, broker-agnostic** (HA, ioBroker, Node-RED, Tasmota, zigbee2mqtt standalone); HA devices via their MQTT discovery. No HA API source (cgiesche's HA plugin covers that niche).
- **Identity:** "MQTT Controller" (short **MQC**), UUID `de.boriskemper.mqtt-controller`, repo `rocklobster42195/streamdeck-mqtt-controller` (private first), folder `C:\dev\mqtt-controller`, fresh start (no old history), Rocklobster logo + MQTT motif.
- **v1 actions:** Switch key (toggle, shows state) · Publish key (fixed payload/JSON: scene, gate) · Value key (sensor, unit, threshold colors) · Multi-state key (cycle values, e.g. fan 1-2-3-off) · Slider dial (rotate = set, push = toggle). Later: Value dial with sparkline.
- **v1 discovery:** topic browser (live tree, values, search) + Home Assistant MQTT discovery (`homeassistant/…/config`; also covers zigbee2mqtt/Tasmota when they publish in HA format). Later: native zigbee2mqtt (`bridge/devices`) and Tasmota (`tasmota/discovery`).
- **Connection:** one broker, global settings + connection card in every PI; URL (`mqtt://`, `mqtts://`, `ws://`, `wss://`; bare host = `mqtt://host:1883`); user/password, "allow self-signed"; fixed auto client id `mqc-<random>`; reconnect with backoff; keys greyed out when offline; clear "access denied" on bad login. Later: several brokers, client certificates.
- **Payloads:** plain text as is, JSON by field path (click a field in the live payload in the PI; nested like `color.x`); state topic + command topic (default: same; HA discovery fills both); free on/off values, compared case-insensitively; publish plain value or template (`{"state":"{value}"}`); optimistic update, reverts after 3 s without confirmation; retain off / QoS 0 by default, under "Advanced".
- **Shared code:** `streamdeck-core` gets its own repo + npm package (like the client); the generic PI parts still in the MAC plugin (MDI icon picker + catalog, selects, connection card base, key preview) move there. Package **`@rocklobster42195/streamdeck-plugin-kit`**, repo `rocklobster42195/streamdeck-plugin-kit`. **Order: carve out the kit first and switch MAC to it, then build MQC on it.** SC later.
- **Kit contents:** all of `streamdeck-core` (PI components, i18n, sd-client, marquee/animation/title-fader/text-width/png, **Panorama effects**) + from MAC: icon picker, select, key preview, connection-card base, MDI catalog, plugin↔PI bridge (options, preview), key image + dial strip rendering, glide, color fade, frame ticker, optimistic store, latest-sender, alarm timers, volume fade. MA-specific parts stay in MAC; `key-image.ts`, `pi-bridge.ts` (and other MA-coupled files) get split on the way.
- **Testing:** simulator with an in-process broker (`aedes`) and invented HA-discovery devices (lamp with brightness, temperature sensor, fan with levels, gate) for keys, dials, discovery and Marketplace screenshots; the real broker only with own test topics `mqc/test/…`; **never switch real devices without asking**; PI preview without Stream Deck against the test broker.
- **Conventions like MAC:** EN + DE UI, English code comments, free, README disclaimer, credentials in global settings, MQTT 3.1.1 + 5.
- **Later (not v1):** Value dial with sparkline, native zigbee2mqtt/Tasmota discovery, several brokers, client certificates, device templates (shareable JSON presets), HA API source (door kept open).

## Starting point: the old project
`C:\Users\Boris\OneDrive\Dokumente\StreamdeckPlugins\mqtt-controller` — 2 commits ("First working", Jan 2024), SDK v0.2 / manifest SDKVersion 2, `mqtt` 5.3.
- One action: **Toggle key** (`de.boriskemper.mqtt-controller.toggle`). Per key: broker IP/port/user/password (no global settings), subscribe topic, publish topic, two state values (`valueState0/1`), optional value + unit as title.
- `MqttManager` singleton: one client, subscribes per key, maps incoming messages to key states (state 0/1 + title), unsubscribes when no key needs a topic any more.
- Icons: fixed PNGs per state (bulb, desk lamp, bike, toggle).
- Example topics in the code are ioBroker adapters: `hm-rpc/0/OEQ1155223/1/STATE` (Homematic wall lamps), `sonoff/0/S20/POWER` (Kickr Core power), `hm-rpc/1/…/ACTUAL_TEMPERATURE` (outside temperature).
- Weaknesses: credentials per key, no reconnect/error handling, strings only (no JSON), one action type, no topic discovery.

## Q&A log

### Q0 — Ideas presented (before Q1)
1. Topic browser in the PI (live tree with values, search, click to pick — like MQTT Explorer).
2. Device discovery: Home Assistant MQTT discovery, zigbee2mqtt, Tasmota → pick "Wohnzimmer Licht" instead of topics; payloads, units, ranges come along.
3. Actions: Toggle key, Publish key (fixed payload/scene), Value key (sensor), Multi-state key (cycle values), Slider dial (brightness/setpoint, ring like Volume dial), Value dial with sparkline.
4. JSON payloads: read by path, publish with templates.
5. MAC-style looks: MDI icon per state, colors, thresholds ("ab 25 °C rot"), offline state via availability topics.
6. Solid connection: broker once in global settings, TLS, reconnect, connection card.
7. Shared code via `streamdeck-core`.

### Q1 — Audience; the user's own system
- Asked: a) internal, b) public Marketplace plugin (general MQTT + HA/zigbee2mqtt/Tasmota). Recommended b). Plus: what runs on MQTT today?
- Captured: **b** — public. **"HA iobroker schalte ich nach und nach ab"** → the user's system is Home Assistant; ioBroker is being phased out.
- Flags: —

### Q2 — Positioning: MQTT vs Home Assistant API
- Asked: a) pure MQTT, broker-agnostic, HA devices via MQTT discovery; b) HA-native via its WebSocket API (competes with cgiesche's HA plugin); c) both. Recommended a) now with the value source kept swappable for c) later. Also asked which of the user's devices run over MQTT.
- Captured: **a** — pure MQTT. (The recommendation's "keep the source swappable" wasn't objected to; the device question was not answered.)
- Note: in HA only MQTT-based entities (zigbee2mqtt, Tasmota, …) are reachable this way; the user's own HA setup will only partly be covered.
- Flags: which of the user's devices run over MQTT today → user (useful for the test setup, not blocking)

### Q3 — Name and identity
- Captured (confirmed "ok"): display name **MQTT Controller**, short **MQC**; UUID `de.boriskemper.mqtt-controller` (old one, never public); repo `rocklobster42195/streamdeck-mqtt-controller`, private at first; folder `C:\dev\mqtt-controller`; fresh start without the 2024 history; logo = Rocklobster lobster + small MQTT motif.
- Flags: —

### Q4 — v1 actions
- Asked (proposal): v1 = Switch key, Publish key, Value key, Slider dial; later = Multi-state key, Value dial with sparkline.
- Captured: **"mehrstufig nehmen wir noch mit"** → Multi-state key moves into v1. v1 = Switch, Publish, Value, Multi-state (keys) + Slider (dial). Value dial with sparkline stays later.
- Flags: —

### Q5 — Discovery in v1
- Captured (confirmed "ok"): v1 = **topic browser** + **HA MQTT discovery**. zigbee2mqtt and Tasmota can publish HA-format discovery (z2m does by default with HA), so most setups are covered. Native z2m `bridge/devices` and Tasmota `tasmota/discovery` come later.
- Flags: —

### Q6 — Broker connection
- Captured (confirmed "ok"): one broker for the whole plugin (global settings, connection card in every PI like MAC); address as URL with `mqtt://`, `mqtts://`, `ws://`, `wss://` (bare host → `mqtt://host:1883`); username/password + "allow self-signed certificates"; client id generated once (`mqc-<random>`) and kept; auto-reconnect with growing delay; keys greyed out while disconnected; bad login → clear "access denied". Later: several brokers, client certificates.
- Flags: —

### Q7 — Payload handling
- Captured (confirmed "ok"):
  - Read: plain text directly; JSON → pick a field; the PI shows the current payload and a click on a field takes it; nested paths (`color.x`).
  - State topic + command topic; command defaults to the state topic (zigbee2mqtt needs `…/set`); devices from HA discovery bring both.
  - On/off values free (`ON`/`OFF`, `true`/`false`, `1`/`0`), compared case-insensitively.
  - Publish: plain value or template (`{"state":"{value}"}`, `{"brightness":{value}}`).
  - Optimistic: the key shows the new state at once, reverts if the device doesn't confirm within 3 s (like MAC).
  - Retain off, QoS 0 by default; both under "Advanced".
- Flags: —

### Q8 — Sharing code with MAC
- Found: `streamdeck-core` is a folder in the MAC repo, unpublished; the wanted parts (MDI icon picker, selects, connection card, key preview) still live in `plugin/src/pi-ui` of MAC, not in core. SC shares by copies + sync rule.
- Asked: a) copy like SC, b) own repo + npm package for the kit, generic PI parts move there, c) one monorepo for all plugins. Recommended b); name proposal `streamdeck-plugin-kit` or `@rocklobster/streamdeck-kit`; order?
- Captured: **"b erst ausgliedern"** — b, and the kit is carved out first (MAC switched to it), then MQC is built on it.
- Flags: package name → Q9

### Q9 — Package name
- Checked: `streamdeck-kit`, `streamdeck-plugin-kit`, `streamdeck-core`, `@rocklobster42195/streamdeck-kit` all free on npm.
- Asked: proposed `@rocklobster42195/streamdeck-kit` (scope makes it clearly unofficial; unscoped "streamdeck-*" could look like Elgato's).
- Captured: **"@rocklobster42195/streamdeck-plugin-kit sollten wir nehmen. Es geht um plugins"** → package `@rocklobster42195/streamdeck-plugin-kit`, repo `rocklobster42195/streamdeck-plugin-kit` (assumed to match).
- Flags: confirm repo name = package name → assumed

### Q10 — What goes into the kit
- Captured (confirmed "ok"):
  - Into the kit: everything in `streamdeck-core` (PI building blocks: section, toggle, range, choice tiles, color, field, i18n, SD client; marquee, animation, title fader, text widths, PNG; **Panorama effects**) + from MAC's PI: icon picker, select, key preview, connection-card skeleton (status, address, login — no MA details) + from MAC's plugin: MDI catalog, plugin↔PI bridge (option lists, preview), key image and dial strip rendering (ring, scrims), glide, color fade, frame ticker, optimistic store, latest-sender, alarm timers, volume fade.
  - Stays in MAC: player/item pickers, provider filter, flow mode, covers, lyrics, browser, queue — anything Music Assistant.
  - Panorama goes into the kit (SC uses it too; MQC dials may get effect backgrounds later).
  - MA-coupled files (`key-image.ts`, `pi-bridge.ts`, …) are split while moving.
- Flags: —

### Q11 — Testing
- Captured (confirmed "ok"): simulator with an in-process broker (`aedes`) + invented devices announced via HA discovery (lamp with brightness, temperature sensor, fan with levels, gate) → keys, dials, discovery, Marketplace screenshots without the real home; against the real broker only with own test topics under `mqc/test/…`; real devices are never switched without asking (same rule as playback in MAC); PI preview without Stream Deck (like `pi:preview`) against the test broker.
- Flags: the user's broker (Mosquitto add-on in HA?) — not answered → user

### Q12 — Completeness backstop
- Handled like MAC without asking: UI EN + DE, code comments English; free, README disclaimer (unofficial community plugin); credentials in Stream Deck global settings (local); MQTT 3.1.1 and 5 (`mqtt` lib).
- Offered: device templates to share, wildcard topics for the display.
- User asked: **"Was meinst du mit geräte vorlagen?"** → explained: presets per device type (e.g. Shelly Plus 1, Tasmota plug, a zigbee2mqtt lamp) that fill state/command topic, on/off values, JSON field and range from a device name/id; stored as small JSON files, so users can contribute more; export/import of a key's settings as a side effect. Mainly useful for devices without HA discovery.
- Recommended: later, not v1. Captured: **"nein"** — nothing else missing; device templates later. User: "Schreibe das Konzept in den neuen Ordner. Zurnot grobe Ordnerstruktur erstellen."

### Probe 2026-09-26 — the user's broker (read-only, nothing published)
- Mosquitto 2.0.22, login OK, connected in 13 ms (MQTT 3.1.1).
- 719 topics within 8 s, **715 retained** → the topic browser gets an almost complete picture right after subscribing.
- **621 of 719 payloads are JSON** → the JSON field picker is essential, not a nice-to-have.
- Roots: homeassistant 514 · jsa 83 · zigbee2mqtt 59 · awtrix_71f23c 30 · REG77 10 · 0_userdata 5 · mhz19_co2_sensor 5 · hm-rpc 3 · esphome 2 · tasmota 2 · iobroker 2 · …
- **HA discovery: 506 configs, 61 devices, 185 controllable entities.** Components: sensor 230 · device_automation 63 · select 40 · button 28 · update 26 · switch 22 · light 21 · number 21 · binary_sensor 19 · text 10 · scene 9 · event 9 · music_player 8. Manufacturers: Aqara, Philips, IKEA, Xiaomi, Blueforcer (AWTRIX), OSRAM, **JS Automations** (the user's own JSA add-on publishes HA discovery too), Zigbee2MQTT, Shelly, Innr.
- Mapping HA components → v1 actions: switch/light → Switch · sensor/binary_sensor → Value · button/scene → Publish · select → Multi-state · number/light brightness → Slider. `update`, `text`, `event`, `device_automation` not in v1.

## Open flags (pending input)
- ~~Which broker~~ → test broker `mqtt://192.168.7.135:1883`, user `mosquser` (from the old plugin's settings); password in `.env` (user fills it in). Host: **"zurzeit noch eine eigene mosquitto VM (oder Container)"** — standalone Mosquitto, not the HA add-on (may move later). **Home Assistant is connected to this broker** → real HA discovery (`homeassistant/…`) can be tested there (read-only unless the user agrees).
- Which of the user's devices run over MQTT today (test setup) → user
