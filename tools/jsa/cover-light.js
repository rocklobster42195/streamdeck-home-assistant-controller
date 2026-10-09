/**
 * @name HA-C Coverlicht (Test)
 * @icon mdi:palette
 * @label HA-C
 *
 * Test script for the cover colour (HA-C grill 2026-10-09): colours the lamps below in the colour of
 * what plays on the Stream Deck. Needs HA-C's "Stream Deck in Home Assistant anzeigen" (sensor
 * sensor.ha_c_cover_color). Only lamps that are on are recoloured; nothing is switched on or off.
 * Start or stop the script in JSA to switch it on or off.
 */

// Your lamps (colour-capable lights)
const LAMPS = ['light.REPLACE_ME'];
const SENSOR = 'sensor.ha_c_cover_color';
/** Seconds the lamps take to fade into the new colour. */
const TRANSITION = 2;
/** Covers are often pale: at least this saturation (0–100) on the lamp. */
const MIN_SATURATION = 60;
/** Below this saturation the cover counts as grey: warm white instead. */
const GREY_BELOW = 12;
const WARM_WHITE_KELVIN = 2700;

function apply(state) {
  const hs = state?.attributes?.hs_color;
  if (!Array.isArray(hs)) return;
  const [hue, sat] = hs;
  const lit = LAMPS.filter((id) => ha.getState(id)?.state === 'on');
  if (!lit.length) return;
  const data =
    sat < GREY_BELOW
      ? { color_temp_kelvin: WARM_WHITE_KELVIN }
      : { hs_color: [hue, Math.max(sat, MIN_SATURATION)] };
  ha.log(`${state.state} (${state.attributes.title ?? '?'}) → ${lit.join(', ')}`);
  ha.call('light.turn_on', { entity_id: lit, transition: TRANSITION, ...data });
}

ha.on(SENSOR, (e) => apply(e));
apply(ha.getState(SENSOR));
ha.log(`Coverlicht: ${LAMPS.join(', ')} folgen ${SENSOR}`);
