// The settings window's menu: a fixed column on the left with the visible sections (device, the
// pi-sections, the connections). A click scrolls to one; the one in view is highlighted
// (scroll spy). Sections hidden for this key (e.g. MQTT topics of an HA key) are left out.
import { escapeHtml, sd, t } from "@rocklobster42195/streamdeck-kit/pi";

type Entry = { el: HTMLElement; title: string };

export function initWindowNav(): void {
    const nav = document.createElement("nav");
    nav.className = "hac-window-nav";
    document.body.prepend(nav);
    let entries: Entry[] = [];
    // Ids stay once given; a counter, as sections appear later (the picker after its first answer)
    let nextId = 0;

    const sections = (): Entry[] => {
        const out: Entry[] = [];
        // pi-section moves its title attribute into a .pi-section-title element when it is built
        document.querySelectorAll<HTMLElement>("hac-device, pi-section, #connections").forEach((el) => {
            if (el.hidden || el.closest("[hidden]") || getComputedStyle(el).display === "none") return;
            const title = el.id === "connections" ? t("pi.connections") : el.tagName === "HAC-DEVICE" ? t("pi.pick_device") : (el.querySelector(":scope > .pi-section-title")?.textContent ?? "");
            if (title) out.push({ el, title });
        });
        return out;
    };

    const render = () => {
        entries = sections();
        for (const e of entries) e.el.id ||= `hac-sec-${nextId++}`;
        nav.innerHTML = entries.map((e) => `<a href="#${e.el.id}" data-id="${e.el.id}">${escapeHtml(e.title)}</a>`).join("");
        spy();
    };

    /** The last section whose top has passed a line a little below the window's top. */
    const spy = () => {
        const line = 80;
        let current = entries[0];
        for (const e of entries) if (e.el.getBoundingClientRect().top <= line) current = e;
        // At the very bottom, the last section counts even if its top never reaches the line
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = entries[entries.length - 1];
        nav.querySelectorAll<HTMLElement>("a").forEach((a) => a.classList.toggle("active", a.dataset.id === current?.el.id));
    };

    nav.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a) return;
        e.preventDefault();
        document.getElementById(a.dataset.id ?? "")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    window.addEventListener("scroll", spy, { passive: true });
    // Sections come and go with the settings (source, look, press action) and the plugin's answers
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
        clearTimeout(timer);
        timer = setTimeout(render, 50);
    };
    sd.onSettings(later);
    sd.onGlobalSettings(later);
    sd.onMessage(later);
    render();
}
