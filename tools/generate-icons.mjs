// Generates the plugin's static icons from Material Design Icons and the Rocklobster lobster.
// Usage: npm run icons
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.resolve("plugin/package.json"));
const mdi = require("@mdi/js");
const sharp = require("sharp");
const root = "plugin/de.boriskemper.mqtt-controller.sdPlugin/imgs";

// Action list icon: white on transparent (Stream Deck tints it). Key: the default key image.
const actions = {
    switch: mdi.mdiLightbulbOnOutline,
    value: mdi.mdiGauge,
};

const listIcon = (d) => `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="#ffffff" d="${d}"/></svg>`;
const keyImage = (d) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="#101010"/><path transform="translate(32 32) scale(3.333)" fill="#e0e0e0" d="${d}"/></svg>`;

function write(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    console.log("wrote", file);
}

for (const [name, d] of Object.entries(actions)) {
    write(`${root}/actions/${name}/icon.svg`, listIcon(d));
    write(`${root}/actions/${name}/key.svg`, keyImage(d));
}

// Category and plugin icon: the Rocklobster lobster (shared by all Rocklobster plugins).
const LOGO = "#F7A600"; // Yellow Sea from the house palette (komuh/docs/cd-farben.md)
const lobsterSvg = fs.readFileSync("docs/brand/lobster.svg", "utf8");
const viewBox = lobsterSvg.match(/viewBox="([^"]+)"/)[1];
const lobsterPath = lobsterSvg.match(/ d="([^"]+)"/)[1];
const lobster = (color, stroke = 0) => `<path fill="${color}" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="round" fill-rule="evenodd" d="${lobsterPath}"/>`;

write(`${root}/plugin/category-icon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="${viewBox}">${lobster("#f2f2f2", 6)}</svg>`);
const pluginIcon = (size) => {
    const pad = size * 0.17;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${LOGO}"/><svg x="${pad}" y="${pad}" width="${size - 2 * pad}" height="${size - 2 * pad}" viewBox="${viewBox}">${lobster("#0a141e", 6)}</svg></svg>`;
};
for (const [file, size] of [["marketplace.png", 256], ["marketplace@2x.png", 512]]) {
    fs.mkdirSync(`${root}/plugin`, { recursive: true });
    await sharp(Buffer.from(pluginIcon(size))).png().toFile(`${root}/plugin/${file}`);
    console.log("wrote", `${root}/plugin/${file}`);
}
