# HA-C (Home Assistant Controller): Ideas

Status: **ideas only** ("Gedankenspiele", 2026-09-27). Nothing is decided and nothing is built. Focus stays on the MA-C go-live, then XR-C or MQ-C.

## Why a Home Assistant plugin at all

The user runs the existing Home Assistant plugin (Christoph Giesche's) every day. What bothers them about it:
- **Generic dials:** every entity type gets the same dial.
- **Keys** only show an icon and at most two lines of text, with no other design options.

Earlier, the MQC concept ruled out a Home Assistant API plugin because Giesche's plugin covers that. **The kit bus changes this:** Home Assistant can become the automation hub of the whole suite.

## Principles

- **Logic belongs in Home Assistant.** The plugin shows things and triggers things: it calls services, scripts and scenes. It has no conditions or automations of its own. Anything that decides something comes from HA (or JSA), and the plugin only draws it.
- **The standalone plugins stay important.** Bus features between plugins (ducking, audio-reactive Panorama, frame budget) are only about using and showing things, so every plugin works fully **without** Home Assistant.
- **No Python integration.** Anything needed on the HA side is a **JSA mini-integration**: one JSA script like the Tedee Keypad example (`C:/dev/ha-js_automations_addon/examples/tedee_keypad.ts`, in the JSA library as a gist). Script Packs (a script plus a Lovelace card) are for *other* displays such as dashboards, so they are not the tool here (the user, 2026-09-27).

## Name

Display name **Home Assistant Controller**, public short name **HA-C**. With the hyphen it no longer reads like "HACS". It follows the suite pattern <system>-C.

## Where it stands apart

- **Dials per entity type:**
  - light: a brightness ring plus color temperature or color;
  - climate: target and current temperature as a gauge;
  - cover: position;
  - sensor: value plus sparkline;
  - media players are left to MA-C.
- **Key layouts:**
  - a large value with its unit;
  - a gauge or bar with threshold colors;
  - several entities on one key (e.g. inside and outside temperature);
  - icon and color per state;
  - a camera snapshot as the background.

  All of this comes from the kit: gauges, the color picker, `pi-thresholds`, `pi-override`.
- **Architecture:** the entity actions (Switch, Value, Multi-state, Slider, later a Value dial) are shared with MQ-C. There are two slim plugins on top: MQ-C with MQTT as its value source, and HA-C with the Home Assistant WebSocket API as its value source. HA-C adds pickers by area and device, plus services and scenes.

## Discovery

- **HA-C finds Home Assistant:** HA announces itself through zeroconf (`_home-assistant._tcp`), so the connection card offers the instances it finds, as XR-C does with `/xinfo`.
- **Decided 2026-10-01** (see `docs/concept.md`, "The deck as a device in Home Assistant"): MQTT Discovery from HA-C itself plus WebSocket events, new actions "Ereignis" and "Meldung". The original idea below stays for reference.
- **The deck becomes visible in Home Assistant, through HA's own event bus.** This needs no extra ports and no mDNS on the HA side.
  1. **Events (possible in v1):** HA-C fires events over the WebSocket API, e.g. `ha_c_key_pressed` with deck, page, key and gesture. Normal HA automations can use them without anything else installed.
  2. **Announce and commands:** HA-C fires `ha_c_announce` (deck id, name, model, layout) and subscribes to `ha_c_command`. Anything in HA can then send commands: an automation, a script, or JSA. Examples: show an overlay across the deck, set a key, trigger a scene.
  3. **JSA mini-integration "Stream Deck"**, built like Tedee Keypad:
     - one script with the header `@label Integration`, its config kept in `ha.persistent()`, published in the JSA library;
     - it listens to `ha_c_announce`, then registers **one device per deck** with entities through `ha.register()`, updates them with `ha.update()`, and handles commands with `ha.on()`.

     Commands become **ordinary HA entities** instead of custom services, so they work from any automation or dashboard:
     - `event`: key and dial presses (gesture as the event type);
     - `sensor`: active page, connection, and the Stream Deck model (diagnostic);
     - `number`: **deck brightness**, controlled from HA (e.g. dimmed at night);
     - `switch`: night mode, screensaver;
     - `notify` (MQTT notify): **`notify.send_message` shows an overlay on the deck**, e.g. a doorbell or "washing machine finished";
     - `button`: identify (the deck flashes);
     - `select`: switch profile or page, if the SDK allows it.

     The script talks to the plugin through HA's event bus (`ha_c_command` / `ha_c_announce`), so neither side needs its own port. The deck then becomes a real HA device, a remote with a display, and HA decides everything. Note: `ha.register()` uses MQTT Discovery, so it needs a broker to survive restarts.
  4. **Without JSA, through MQ-C:** MQ-C already talks MQTT, so it could publish the same Home Assistant discovery for the deck itself. Only as a thought, not planned.

## JSA on the deck

JSA webhooks (`ha.onWebhook`, port 3001) are bidirectional, which fits exactly:
- **JSA key:** a press sends a POST to `:3001/webhook/<id>`, and the script's answer says what the key shows:
  ```js
  ha.onWebhook("deck-kaffee", () => ({ title: "Kaffee", value: 3, icon: "mdi:coffee", color: "#E30018" }));
  ```
  All logic stays in the JSA script, and the deck only draws.
- **JSA dial:** rotating sends the delta, and the answer is the new value.
- **Push the other way** goes through `ha_c_command`. A JSA script can make, say, the doorbell appear on the deck. Later there could be a small `deck` helper in the JSA library.
- **Open points:**
  - port 3001 must be reachable in the LAN;
  - where the token comes from (typed into the settings panel, or copied from JSA's webhook panel);
  - an endpoint in JSA that lists its webhooks, so the settings panel could offer a picker;
  - whether the JSA key is built first as a small action elsewhere (e.g. in MQ-C or a mini plugin) — a possible unique selling point.

## Together with the kit bus

- **Home Assistant as the source of alerts:** doorbell, washing machine finished or an alarm triggers the alert overlay across the deck (sent through `ha_c_command`, spread across all plugins by the bus).
- **HA states drive the whole suite:** away, night or movie night set the night mode and scenes in every plugin.
- **HA sensors** go into gauges and sparklines, and can also tint MA-C's Panorama effects.
- **deckbus states become HA entities** (SA-C grill 2026-10-05, `system-audio-controller/notes/2026-10-05-sac-future-grill.md`): HA-C mirrors other plugins' bus states through the JSA mini-integration, e.g. SA-C's "call active" as `binary_sensor` (app as attribute), mic muted, active output device, and the active audio scene as `select` (HA can trigger scenes too). The other plugins know nothing about HA.
- **The Multi-state key moves into the kit** (same grill): the key and its states editor become kit code; HA-C, MQ-C and SA-C (App output key, scene key) build on it.

- **Deck brightness without a brightness API: the suite draws itself dark** (idea 2026-10-15, user; not decided). The Stream Deck SDK has no brightness, but a plugin can draw its own keys and dials black. So the number from the JSA list above becomes a plain HA entity (`input_boolean.deck_blackout` for on/off or `input_number.deck_brightness` for 0–100 %; works without any integration, HA-C reads it like any entity), HA-C broadcasts it on deckbus as `display: { level: 0..1 }`, and the kit draws every key and dial through a black overlay with that opacity (one place for the key actions, the Panorama engine and the lists).
  - Intermediate levels come for free, and a soft transition. The panel's backlight stays on; a black picture is practically dark.
  - Not covered: actions a plugin draws itself outside the kit (SO-C's Multi-Control key) until they are connected one by one; a second PC (the bus is local).
  - A black key still takes presses: **wake on touch** (the first touch lights the deck for about 10 s and isn't executed) is the nice-to-have.
  - The level is a general kit setting, HA-C is one source of it; SA-C (a call), a key or another plugin could set it as well. The Stream Deck app's own screen saver and brightness overlap with it.
  - Open: on/off only or a level (leaning: a level, on/off is its special case), wake on touch now or later.
