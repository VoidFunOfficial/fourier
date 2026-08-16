import { SdkError } from "./errors.ts";

export interface LoadFontOptions {
  /** CSS font weight represented by this font file. Defaults to 400. */
  readonly weight?: number | "normal" | "bold";
  /** CSS font style represented by this font file. Defaults to normal. */
  readonly style?: "normal" | "italic" | "oblique";
}

const installedFonts = new WeakMap<Document, Set<string>>();

function fontWeight(value: LoadFontOptions["weight"]): string {
  if (value === undefined) return "400";
  if (value === "normal" || value === "bold") return value;
  if (Number.isInteger(value) && value >= 1 && value <= 1_000) {
    return String(value);
  }
  throw new SdkError(
    "INVALID_FONT_OPTIONS",
    "loadFont weight 必须是 1—1000 的整数、normal 或 bold",
    { weight: value },
  );
}

function fontStyle(value: LoadFontOptions["style"]): string {
  if (value === undefined) return "normal";
  if (value === "normal" || value === "italic" || value === "oblique") {
    return value;
  }
  throw new SdkError(
    "INVALID_FONT_OPTIONS",
    "loadFont style 必须是 normal、italic 或 oblique",
    { style: value },
  );
}

function hashFontIdentity(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
    second ^= second >>> 13;
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

function installFont(
  document: Document,
  family: string,
  source: string,
  weight: string,
  style: string,
): void {
  let installed = installedFonts.get(document);
  if (installed === undefined) {
    installed = new Set<string>();
    installedFonts.set(document, installed);
  }
  if (installed.has(family)) return;

  const element = document.createElement("style");
  element.dataset.fourierFontFamily = family;
  element.textContent = [
    "@font-face{",
    `font-family:${JSON.stringify(family)};`,
    `src:url(${JSON.stringify(source)});`,
    `font-weight:${weight};`,
    `font-style:${style};`,
    "font-display:block;",
    "}",
  ].join("");
  document.head.appendChild(element);
  installed.add(family);
}

/**
 * Registers a bundled browser font and returns its generated CSS family.
 * Pass a local `.otf`, `.ttf`, `.woff`, or `.woff2` import (or a data URI).
 */
export function loadFont(
  source: string,
  options: LoadFontOptions = {},
): string {
  if (
    typeof source !== "string" ||
    source.trim() === "" ||
    /^(?:https?:)?\/\//i.test(source.trim())
  ) {
    throw new SdkError(
      "INVALID_FONT_SOURCE",
      "loadFont source 必须是非空的本地字体 URL 或 data URI",
    );
  }
  const weight = fontWeight(options.weight);
  const style = fontStyle(options.style);
  const family = `FourierFont-${hashFontIdentity(`${source}\0${weight}\0${style}`)}`;
  if (typeof document !== "undefined") {
    installFont(document, family, source, weight, style);
  }
  return family;
}
