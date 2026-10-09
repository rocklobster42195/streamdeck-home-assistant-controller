/**
 * @name HA-C Coverlicht (Test)
 * @icon mdi:palette
 * @label HA-C
 * @npm jimp
 * @permission network
 *
 * Test script for the cover colour (HA-C grill 2026-10-09): colours the lamps below in the colour of
 * what plays. Two sources:
 *  - Stream Deck online (binary_sensor.ha_c_stream_deck): HA-C's sensor.ha_c_cover_color. While a
 *    Cover Light key on the deck is on (attribute cover_light), HA-C drives its lamps itself and
 *    this script stays quiet.
 *  - Stream Deck offline: the cover of the playing player below (Music Assistant or any other
 *    media_player), its colour worked out here from the picture.
 * Only lamps that are on are recoloured; nothing is switched on or off. Start or stop the script in
 * JSA to switch it on or off.
 */
const { Jimp } = (() => {
  const m = require('jimp');
  return { Jimp: m.Jimp ?? m };
})();

// Your lamps (colour-capable lights)
const LAMPS = ['light.REPLACE_ME'];
// Players whose cover counts while Stream Deck is offline, the first one that plays wins
const PLAYERS = ['media_player.REPLACE_ME'];
/** Home Assistant as seen from JSA (pictures come as /api/media_player_proxy/… links). */
const HA_URL = 'http://homeassistant:8123';

const SENSOR = 'sensor.ha_c_cover_color';
const ONLINE = 'binary_sensor.ha_c_stream_deck';
/** Seconds the lamps take to fade into the new colour. */
const TRANSITION = 2;
/** Covers are often pale: at least this saturation (0–100) on the lamp. */
const MIN_SATURATION = 60;
/** Below this saturation the cover counts as grey: warm white instead. */
const GREY_BELOW = 12;
const WARM_WHITE_KELVIN = 2700;

let lastPicture = '';

const deckOnline = () => ha.getState(ONLINE)?.state === 'on';

/** Sends a colour (hue 0–360, saturation 0–100) to the lamps that are on. */
function colourLamps([hue, sat], why) {
  const lit = LAMPS.filter((id) => ha.getState(id)?.state === 'on');
  if (!lit.length) return;
  const data =
    sat < GREY_BELOW
      ? { color_temp_kelvin: WARM_WHITE_KELVIN }
      : { hs_color: [Math.round(hue * 10) / 10, Math.max(sat, MIN_SATURATION)] };
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

/** From a player's cover (Stream Deck offline). */
async function fromPlayers() {
  if (deckOnline()) return;
  const player = PLAYERS.map((id) => ha.getState(id)).find((s) => s?.state === 'playing' && s.attributes.entity_picture);
  if (!player) return;
  const picture = player.attributes.entity_picture;
  if (picture === lastPicture) return;
  lastPicture = picture;
  try {
    const url = picture.startsWith('http') ? picture : `${HA_URL}${picture}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const hs = await coverHs(Buffer.from(await res.arrayBuffer()));
    colourLamps(hs, `${player.attributes.media_title ?? '?'} (${player.entity_id})`);
  } catch (e) {
    ha.warn(`Cover von ${player.entity_id}: ${e.message}`);
    lastPicture = '';
  }
}

/**
 * The cover's colour as hue/saturation: the picture shrunk to 24×24, pixels grouped by hue and
 * weighted by how colourful and bright they are; the strongest group wins. Mostly grey: grey.
 */
async function coverHs(buffer) {
  const img = await Jimp.read(buffer);
  if (img.resize.length >= 2) img.resize(24, 24);
  else img.resize({ w: 24, h: 24 });
  const data = img.bitmap.data;
  const buckets = new Map();
  let colourful = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, v] = hsv(data[i], data[i + 1], data[i + 2]);
    if (s < 0.15 || v < 0.15) continue;
    colourful++;
    const w = s * v;
    const key = Math.floor(h / 20);
    const b = buckets.get(key) ?? { w: 0, x: 0, y: 0, s: 0 };
    // Hues averaged on the circle (red at 350° and 10° belong together)
    b.w += w;
    b.x += Math.cos((h * Math.PI) / 180) * w;
    b.y += Math.sin((h * Math.PI) / 180) * w;
    b.s += s * w;
    buckets.set(key, b);
  }
  if (colourful < (data.length / 4) * 0.05) return [0, 0];
  const best = [...buckets.values()].sort((a, b) => b.w - a.w)[0];
  const hue = ((Math.atan2(best.y, best.x) * 180) / Math.PI + 360) % 360;
  return [hue, (best.s / best.w) * 100];
}

function hsv(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  let h = 0;
  if (d) {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    h = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max ? d / max : 0, max];
}

ha.on(SENSOR, (e) => fromSensor(e));
ha.on(PLAYERS, () => void fromPlayers());
ha.on(ONLINE, (e) => {
  ha.log(`Stream Deck ${e.state === 'on' ? 'online: Farbe von HA-C' : 'offline: Farbe aus dem Cover der Player'}`);
  lastPicture = '';
  if (e.state === 'on') fromSensor(ha.getState(SENSOR));
  else void fromPlayers();
});

if (deckOnline()) fromSensor(ha.getState(SENSOR));
else void fromPlayers();
ha.log(`Coverlicht: ${LAMPS.join(', ')} · Stream Deck ${deckOnline() ? 'online' : 'offline'}`);
