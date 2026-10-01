// Small SVG helpers for MQC's key images (144×144).
import { escapeXml, wrap } from "@rocklobster42195/streamdeck-kit";

export const SIZE = 144;
export const FONT = `font-family="Segoe UI, Arial, sans-serif"`;
/** House palette Yellow Sea: MQ-C's colour, and the default "on" colour. */
export const ACCENT = "#F7A600";
export const BG = "#101010";

/** An MDI path drawn at (x, y) with the given size. */
export function icon(path: string, x: number, y: number, size: number, color: string, opacity = 1): string {
    return `<path transform="translate(${x} ${y}) scale(${size / 24})" fill="${color}"${opacity < 1 ? ` opacity="${opacity}"` : ""} d="${path}"/>`;
}

/** Centered text lines (wrapped to the key's width) starting at baseline `y`. */
export function lines(text: string, y: number, size: number, color: string, maxLines = 2, weight = 600): string[] {
    return wrap(text, SIZE - 16, size, maxLines).map(
        (l, i) => `<text x="${SIZE / 2}" y="${y + i * (size + 3)}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="middle">${escapeXml(l)}</text>`,
    );
}

export function svgUri(parts: string[]): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join("")}</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
