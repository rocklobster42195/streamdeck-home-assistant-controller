// Entry of the property inspector bundle (ui/pi.js): the kit's components plus MQ-C's connection
// card, topic field and JSON field picker.
import { definePiComponents, initConditionalVisibility, sd, translateDom, type PiChoice, type PiChoiceOption } from "@rocklobster42195/streamdeck-kit/pi";
import { MqcConnectionCard } from "./connection-card";
import { MqcJsonField } from "./json-field";
import { MqcTopic } from "./topic-field";

sd.onReady(() => {
    translateDom();
    definePiComponents();
    customElements.define("mqc-connection-card", MqcConnectionCard);
    customElements.define("mqc-topic", MqcTopic);
    customElements.define("mqc-json-field", MqcJsonField);
    document.querySelectorAll<PiChoice & HTMLElement>("pi-choice[data-options]").forEach((el) => {
        el.options = JSON.parse(el.dataset.options ?? "[]") as PiChoiceOption[];
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
