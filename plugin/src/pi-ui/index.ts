// Entry of the property inspector bundle (ui/pi.js): the kit's components plus HA-C's connection
// cards (Home Assistant, MQTT broker), topic field and JSON field picker.
import { definePiComponents, initConditionalVisibility, sd, translateDom, type PiChoice, type PiChoiceOption } from "@rocklobster42195/streamdeck-kit/pi";
import { mdiCancel, mdiChartDonut, mdiFormatText, mdiGauge, mdiSend, mdiToggleSwitchOutline } from "@mdi/js";
import { HacConnectionCard, HacHaCard } from "./connection-card";
import { HacDevice } from "./device-picker";
import { HacJsonField } from "./json-field";
import { HacStates } from "./states-field";
import { HacTest } from "./test-button";
import { HacTopic } from "./topic-field";

/** MDI paths for <pi-choice data-options='[{"icon":"…"}]'> tiles. */
const CHOICE_ICONS: Record<string, string> = { text: mdiFormatText, gauge: mdiGauge, none: mdiCancel, toggle: mdiToggleSwitchOutline, send: mdiSend, ring: mdiChartDonut };

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
});
