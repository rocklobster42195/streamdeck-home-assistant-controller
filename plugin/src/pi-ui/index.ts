// Entry of the property inspector bundle (ui/pi.js): the kit's components plus HA-C's connection
// cards (Home Assistant, MQTT broker), topic field and JSON field picker. The same page runs as the
// short PI and, with "?window", as the settings window (the kit's src/pi/window.ts).
import { definePiComponents, initConditionalVisibility, initSettingsWindow, isSettingsWindow, sd, settingsWindowShown, translateDom, type PiChoice, type PiChoiceOption } from "@rocklobster42195/streamdeck-kit/pi";
import { mdiCancel, mdiChartDonut, mdiCircleSlice5, mdiFormatText, mdiGauge, mdiHorseshoe, mdiSend, mdiToggleSwitchOutline } from "@mdi/js";
import { HacConnectionCard, HacHaCard } from "./connection-card";
import { HacDevice } from "./device-picker";
import { HacHaAttribute, HacHaEntity } from "./ha-fields";
import { HacJsonField } from "./json-field";
import { HacSources, HacStatesSummary } from "./more";
import { HacStates } from "./states-field";
import { HacTest } from "./test-button";
import { HacTopic } from "./topic-field";

/** MDI paths for <pi-choice data-options='[{"icon":"…"}]'> tiles. */
const CHOICE_ICONS: Record<string, string> = { text: mdiFormatText, gauge: mdiGauge, none: mdiCancel, toggle: mdiToggleSwitchOutline, send: mdiSend, ring: mdiChartDonut, open: mdiHorseshoe, pie: mdiCircleSlice5 };

sd.onReady(() => {
    translateDom();
    definePiComponents();
    customElements.define("hac-ha-card", HacHaCard);
    customElements.define("hac-connection-card", HacConnectionCard);
    customElements.define("hac-device", HacDevice);
    customElements.define("hac-topic", HacTopic);
    customElements.define("hac-json-field", HacJsonField);
    customElements.define("hac-states", HacStates);
    customElements.define("hac-test", HacTest);
    customElements.define("hac-ha-attribute", HacHaAttribute);
    customElements.define("hac-ha-entity", HacHaEntity);
    customElements.define("hac-sources", HacSources);
    customElements.define("hac-states-summary", HacStatesSummary);
    document.querySelectorAll<PiChoice & HTMLElement>("pi-choice[data-options]").forEach((el) => {
        const raw = JSON.parse(el.dataset.options ?? "[]") as PiChoiceOption[];
        el.options = raw.map((o) => ({ ...o, icon: o.icon ? CHOICE_ICONS[o.icon] : undefined }));
    });
    initConditionalVisibility();
    sd.sendToPlugin({ event: "pi-ready" });
    const version = document.querySelector<HTMLElement>("[data-plugin-version]");
    if (version) version.textContent = `HA-C ${sd.info?.plugin.version ?? ""}`.trim();
    document.querySelectorAll<HTMLAnchorElement>("a[href^='http']").forEach((a) =>
        a.addEventListener("click", (e) => {
            e.preventDefault();
            sd.openUrl(a.href);
        }),
    );
    document.body.hidden = false;
    settingsWindowShown();
    // Stream Deck opens windows at 500×650 and ignores sizes and resizeTo; the size is logged
    if (isSettingsWindow()) sd.sendToPlugin({ event: "window-opened", width: window.innerWidth, height: window.innerHeight, scale: window.devicePixelRatio });
});

initSettingsWindow({ name: "HA-C" });
