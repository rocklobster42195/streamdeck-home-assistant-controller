/**
 * @name HA-C Coverlicht (Test)
 * @icon mdi:palette
 * @label HA-C
 * @permission network
 *
 * Test script for the cover colour (HA-C grill 2026-10-09): colours the lamps below in the colour of
 * what plays. Two sources:
 *  - Stream Deck online (binary_sensor.ha_c_stream_deck): HA-C's sensor.ha_c_cover_color. While a
 *    Cover Light key on the deck is on (attribute cover_light), HA-C drives its lamps itself and
 *    this script stays quiet.
 *  - Stream Deck offline: Music Assistant's palette of what plays (its API, every POLL_S seconds):
 *    the most colourful of the palette's colours, as MA-C picks it.
 * Only lamps that are on are recoloured; nothing is switched on or off. Start or stop the script in
 * JSA to switch it on or off.
 */

// Your lamps (colour-capable lights)
const LAMPS = ['light.REPLACE_ME'];
// Music Assistant: its address and a long-lived token (MA → Settings → Profile)
const MA_URL = 'http://REPLACE_ME:8095';
const MA_TOKEN = 'REPLACE_ME';
// MA players that count (their names in MA); empty: the first one that plays
const MA_PLAYERS = [];
const POLL_S = 3;

const SENSOR = 'sensor.ha_c_cover_color';
const ONLINE = 'binary_sensor.ha_c_stream_deck';
/** Seconds the lamps take to fade into the new colour. */
const TRANSITION = 2;
/** Covers are often pale: at least this saturation (0–100) on the lamp. */
const MIN_SATURATION = 60;
/** Below this saturation the cover counts as grey: warm white instead. */
const GREY_BELOW = 12;
const WARM_WHITE_KELVIN = 2700;

let lastSent = '';

const deckOnline = () => ha.getState(ONLINE)?.state === 'on';

/** Sends a colour (hue 0–360, saturation 0–100) to the lamps that are on. */
function colourLamps([hue, sat], why) {
  const data =
    sat < GREY_BELOW
      ? { color_temp_kelvin: WARM_WHITE_KELVIN }
      : { hs_color: [Math.round(hue * 10) / 10, Math.max(Math.round(sat * 10) / 10, MIN_SATURATION)] };
  const key = JSON.stringify(data);
  if (key === lastSent) return;
  const lit = LAMPS.filter((id) => ha.getState(id)?.state === 'on');
  if (!lit.length) return;
  lastSent = key;
  ha.log(`${why} → ${lit.join(', ')}`);
  ha.call('light.turn_on', { entity_id: lit, transition: TRANSITION, ...data });
}

/** From HA-C's sensor (Stream Deck online). */
function fromSensor(state) {
  if (!deckOnline()) return;
  const hs = state?.attributes?.hs_color;
  // A Cover Light key on the deck drives the lamps itself
  if (!Array.isArray(hs) || state.attributes.cover_light) return;
  colourLamps(hs, `${state.state} (${state.attributes.title ?? '?'}, Stream Deck)`);
}

/** From Music Assistant (Stream Deck offline). */
async function fromMusicAssistant() {
  if (deckOnline()) return;
  try {
    const res = await fetch(`${MA_URL.replace(/\/$/, '')}/api`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${MA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'players/all', args: {} }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const players = await res.json();
    const name = (p) => p.display_name ?? p.name;
    const playing = players.filter((p) => p.playback_state === 'playing' && p.current_media?.palette);
    const player = MA_PLAYERS.length ? MA_PLAYERS.map((n) => playing.find((p) => name(p) === n)).find(Boolean) : playing[0];
    if (!player) return;
    const rgb = vividPaletteColour(player.current_media.palette);
    if (rgb) colourLamps(hs(rgb), `${player.current_media.title ?? '?'} (${name(player)}, Music Assistant)`);
  } catch (e) {
    ha.warn(`Music Assistant: ${e.message}`);
  }
}

/** The most colourful of MA's palette colours (as MA-C does). */
function vividPaletteColour(p) {
  const sat = ([r, g, b]) => {
    const max = Math.max(r, g, b);
    return max ? (max - Math.min(r, g, b)) / max : 0;
  };
  const all = [p.accent, p.primary, p.on_dark, p.background_dark].filter((c) => Array.isArray(c) && c.length === 3);
  return all.reduce((best, c) => (!best || sat(c) > sat(best) ? c : best), undefined);
}

/** rgb → [hue 0–360, saturation 0–100]. */
function hs([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max ? (d / max) * 100 : 0];
}

ha.on(SENSOR, (e) => fromSensor(e));
ha.on(ONLINE, (e) => {
  ha.log(`Stream Deck ${e.state === 'on' ? 'online: Farbe von HA-C' : 'offline: Farbe von Music Assistant'}`);
  lastSent = '';
  if (e.state === 'on') fromSensor(ha.getState(SENSOR));
  else void fromMusicAssistant();
});
const timer = setInterval(() => void fromMusicAssistant(), POLL_S * 1000);
ha.onStop(() => clearInterval(timer));

if (deckOnline()) fromSensor(ha.getState(SENSOR));
else void fromMusicAssistant();
ha.log(`Coverlicht: ${LAMPS.join(', ')} · Stream Deck ${deckOnline() ? 'online' : 'offline'}`);
