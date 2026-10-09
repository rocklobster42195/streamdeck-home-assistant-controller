// The deck's players as the other plugins publish them on deckbus (MA-C, SO-C, SA-C). HA-C has no
// players of its own; it only reads them (the cover colour for Home Assistant).
import { PlayerBoard } from "@rocklobster42195/streamdeck-kit";

export const hacPlayers = new PlayerBoard("HA-C");
