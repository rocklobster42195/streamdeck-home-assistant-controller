import streamDeck from "@elgato/streamdeck";
import { setKitLogger } from "@rocklobster42195/streamdeck-kit";
import { SwitchKey } from "./actions/switch-key";
import { MultiStateKey } from "./actions/multi-state-key";
import { PublishKey } from "./actions/publish-key";
import { ValueKey } from "./actions/value-key";
import { startMqcBus, trackMqcActions } from "./bus/mqc-bus";
import { startConnection } from "./mqtt/connection";
import { initPiBridge } from "./pi/handlers";

streamDeck.logger.setLevel("info");
// Kit problems (e.g. a failing render helper) go to the plugin log.
setKitLogger(streamDeck.logger);

streamDeck.actions.registerAction(new SwitchKey());
streamDeck.actions.registerAction(new ValueKey());
streamDeck.actions.registerAction(new PublishKey());
streamDeck.actions.registerAction(new MultiStateKey());
initPiBridge();
trackMqcActions();

await streamDeck.connect();
await startConnection();
streamDeck.logger.info("MQ-C started");
// deckbus: tell other plugins whether the broker is reachable (works without it if the bus can't start)
void startMqcBus();
