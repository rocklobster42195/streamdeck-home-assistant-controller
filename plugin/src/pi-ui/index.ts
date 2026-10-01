// Entry of the property inspector bundle (ui/pi.js): the kit's components plus MQ-C's connection
// card, topic field and JSON field picker.
import { definePiComponents, initConditionalVisibility, sd, translateDom, type PiChoice, type PiChoiceOption } from "@rocklobster42195/streamdeck-kit/pi";
import { mdiCancel, mdiChartDonut, mdiFormatText, mdiGauge, mdiSend, mdiToggleSwitchOutline } from "@mdi/js";
import { MqcConnectionCard } from "./connection-card";
import { MqcDevice } from "./device-picker";
import { MqcJsonField } from "./json-field";
import { MqcStates } from "./states-field";
import { MqcTest } from "./test-button";
import { MqcTopic } from "./topic-field";

/** MDI paths for <pi-choice data-options='[{"icon":"…"}]'> tiles. */
const CHOICE_ICONS: Record<string, string> = { text: mdiFormatText, gauge: mdiGauge, none: mdiCancel, toggle: mdiToggleSwitchOutline, send: mdiSend, ring: mdiChartDonut };

sd.onReady(() => {
    translateDom();
    definePiComponents();
    customElements.define("mqc-connection-card", MqcConnectionCard);
    customElements.define("mqc-device", MqcDevice);
    customElements.define("mqc-topic", MqcTopic);
    customElements.define("mqc-json-field", MqcJsonField);
    customElements.define("mqc-states", MqcStates);
    customElements.define("mqc-test", MqcTest);
    document.querySelectorAll<PiChoice & HTMLElement>("pi-choice[data-options]").forEach((el) => {
        const raw = JSON.parse(el.dataset.options ?? "[]") as PiChoiceOption[];
        el.options = raw.map((o) => ({ ...o, icon: o.icon ? CHOICE_ICONS[o.icon] : undefined }));
    });
    initConditionalVisibility();
    sd.sendToPlugin({ event: "pi-ready" });
    const version = document.querySelector<HTMLElement>("[data-plugin-version]");
    if (version) version.textContent = `MQ-C ${sd.info?.plugin.version ?? ""}`.trim();
    document.querySelectorAll<HTMLAnchorElement>("a[href^='http']").forEach((a) =>
        a.addEventListener("click", (e) => {
            e.preventDefault();
            sd.openUrl(a.href);
        }),
    );
    document.body.hidden = false;
});
