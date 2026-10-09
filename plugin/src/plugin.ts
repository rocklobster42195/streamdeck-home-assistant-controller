import streamDeck from "@elgato/streamdeck";
import { setKitLogger } from "@rocklobster42195/streamdeck-kit";
import { SwitchKey } from "./actions/switch-key";
import { CoverLightKey } from "./actions/cover-light-key";
import { MultiStateKey } from "./actions/multi-state-key";
import { PublishKey } from "./actions/publish-key";
import { SliderDial } from "./actions/slider-dial";
import { ValueKey } from "./actions/value-key";
import { startHacBus, trackHacActions } from "./bus/hac-bus";
import { startConnections } from "./connections";
import { setNumberLanguage } from "./format";
import { initPiBridge } from "./pi/handlers";

streamDeck.logger.setLevel("info");
// Kit problems (e.g. a failing render helper) go to the plugin log.
setKitLogger(streamDeck.logger);

streamDeck.actions.registerAction(new SwitchKey());
streamDeck.actions.registerAction(new ValueKey());
streamDeck.actions.registerAction(new PublishKey());
streamDeck.actions.registerAction(new MultiStateKey());
streamDeck.actions.registerAction(new SliderDial());
const coverLightKey = new CoverLightKey();
streamDeck.actions.registerAction(coverLightKey);
initPiBridge();
trackHacActions();

await streamDeck.connect();
// Numbers on keys in Stream Deck's language (19,4 in German)
setNumberLanguage(streamDeck.info.application.language);
await startConnections();
// Coverlicht keys that were on follow again, also on pages not shown yet
coverLightKey.restore();
streamDeck.logger.info("HA-C started");
// deckbus: tell other plugins whether the broker is reachable (works without it if the bus can't start)
void startHacBus();
