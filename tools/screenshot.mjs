// Reliable PI screenshots with the locally installed Chrome (puppeteer-core, no browser download).
//   node tools/screenshot.mjs <url> <out.png> [--width 360] [--height 760] [--wait 2500]
//        [--type "<selector>=<text>"] [--click "<selector>"] [--full] [--popup]
// --popup: shoot the window a click opened (the kit's settings window) instead of the page.
// Steps run in the order given; --wait also applies after each step.
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const [url, out] = args;
const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
};
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const wait = Number(opt("wait", 2500));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });
try {
    const page = await browser.newPage();
    /** The last window the page opened (window.open). */
    let popup;
    page.on("popup", (p) => (popup = p));
    await page.setViewport({ width: Number(opt("width", 360)), height: Number(opt("height", 760)), deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.error("[page error]", e.message));
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => !document.body.hidden, { timeout: 10000 });
    await sleep(wait);
    for (let i = 2; i < args.length; i++) {
        if (args[i] === "--click") {
            await page.click(args[++i]);
            await sleep(wait);
        } else if (args[i] === "--type") {
            const [selector, text] = args[++i].split(/=(.*)/s);
            await page.type(selector, text, { delay: 30 });
            await sleep(wait);
        }
    }
    // Let lazy images in scroll containers load, then wait for all images to finish.
    await page.evaluate(() => document.querySelectorAll("img[loading=lazy]").forEach((img) => (img.loading = "eager")));
    await page.waitForFunction(() => [...document.images].every((img) => img.complete), { timeout: 8000 }).catch(() => {});
    let shot = page;
    if (args.includes("--popup")) {
        if (!popup) throw new Error("no window was opened");
        await popup.setViewport({ width: Number(opt("width", 360)) + 140, height: Number(opt("height", 760)), deviceScaleFactor: 1 });
        await sleep(wait);
        shot = popup;
    }
    await shot.screenshot({ path: out, fullPage: args.includes("--full") });
    console.log("saved", out);
} finally {
    await browser.close();
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
