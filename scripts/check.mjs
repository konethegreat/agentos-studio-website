import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fallback from "../worker/src/release-fallback.json" with { type: "json" };
import { DOWNLOAD_PREFIX, FLAVORS } from "../worker/src/map.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const failures = [];

const TEXT_EXTENSIONS = new Set([".html", ".css", ".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".txt", ".svg"]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".wrangler", ".wrangler-dry", "docs"]);
// Agent rule files quote the banned markers in order to ban them; they are not site content.
const SKIP_FILES = new Set(["AGENTS.md", "CLAUDE.md", "GEMINI.md"]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // The repository's own docs/ (evidence and screenshots) is skipped; public/docs/ is a page.
      if (SKIP_DIRS.has(entry.name) && (entry.name !== "docs" || dir === root)) continue;
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

function fail(file, message) {
  failures.push(`${path.relative(root, file)}: ${message}`);
}

function resolveLocal(href) {
  const clean = href.split("#")[0].split("?")[0];
  if (!clean || clean.startsWith("mailto:") || clean.startsWith("tel:")) return null;
  if (/^https?:\/\//.test(clean)) return null;
  if (!clean.startsWith("/")) return "relative";
  if (clean.startsWith("/download/") && clean.split("/").filter(Boolean).length === 2) return null;
  if (clean.startsWith("/api/")) return null;
  let target = path.join(publicDir, clean);
  if (clean.endsWith("/")) target = path.join(target, "index.html");
  if (existsSync(target)) return null;
  if (existsSync(`${target}.html`)) return null;
  return target;
}

const placeholderPattern = new RegExp(
  `\\b(${["TO", "DO"].join("")}|${["FIX", "ME"].join("")})\\b|implement ${"later"}|${["\\.", "\\.", "\\."].join("")} existing ${"code"}`
);

const files = await walk(root);
for (const file of files) {
  if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
  if (SKIP_FILES.has(path.basename(file)) && path.dirname(file) === root) continue;
  const text = await readFile(file, "utf8");
  if (/[\u2013\u2014]/.test(text)) fail(file, "contains an en or em dash");
  if (placeholderPattern.test(text)) fail(file, "contains a placeholder marker");
}

const pages = files.filter((file) => file.endsWith(".html"));
if (pages.length < 5) failures.push(`public: expected at least 5 pages, found ${pages.length}`);

for (const page of pages) {
  const html = await readFile(page, "utf8");
  const relative = path.relative(publicDir, page);
  if (!/<html lang="en">/.test(html)) fail(page, "missing lang attribute");
  if (!/<title>[^<]+<\/title>/.test(html)) fail(page, "missing title");
  if (!/<meta name="description"/.test(html)) fail(page, "missing description");
  if (!/<meta name="author" content="Kone Tshivhinda and K-ONE IT SOLUTIONS">/.test(html)) {
    fail(page, "missing the authorship meta tag");
  }
  if (!html.includes("K-ONE IT SOLUTIONS") || !html.includes("Kone Tshivhinda")) {
    fail(page, "missing the visible authorship credit");
  }
  if (/\sstyle=/.test(html) || /<style[\s>]/.test(html)) fail(page, "inline styles break the CSP");
  if (/\son[a-z]+=/.test(html)) fail(page, "inline event handlers break the CSP");
  if (/http:\/\//.test(html)) fail(page, "contains an insecure http link");
  if (!html.includes('href="/download/"')) fail(page, "missing a download link");

  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const ref of refs) {
    const result = resolveLocal(ref);
    if (result === "relative") fail(page, `relative link "${ref}" (use a root path)`);
    else if (result) fail(page, `broken local link "${ref}" -> ${path.relative(root, result)}`);
  }
  if (relative !== "404.html" && !html.includes('href="/credits/"')) fail(page, "missing a credits link");
}

for (const flavor of Object.keys(FLAVORS)) {
  if (!fallback.assets[flavor]) failures.push(`release-fallback.json: missing the ${flavor} asset`);
}

for (const [flavor, asset] of Object.entries(fallback.assets)) {
  if (!asset.url.startsWith(DOWNLOAD_PREFIX)) {
    failures.push(`release-fallback.json: ${flavor} points outside the release download path`);
  }
  if (!asset.name.includes(fallback.version)) {
    failures.push(`release-fallback.json: ${flavor} name does not match version ${fallback.version}`);
  }
}

const headers = path.join(publicDir, "_headers");
if (!existsSync(headers)) failures.push("public/_headers: missing");
if (existsSync(headers)) {
  const text = await readFile(headers, "utf8");
  if (!text.includes("Content-Security-Policy:")) failures.push("public/_headers: missing a Content-Security-Policy");
}

const fonts = ["instrument-serif.woff2", "instrument-serif-italic.woff2", "geist.woff2", "geist-mono.woff2", "OFL.txt"];
for (const font of fonts) {
  if (!existsSync(path.join(publicDir, "fonts", font))) failures.push(`public/fonts: missing ${font}`);
}

const css = await readFile(path.join(publicDir, "styles.css"), "utf8");
for (const match of css.matchAll(/url\("([^"]+)"\)/g)) {
  const ref = match[1];
  if (ref.startsWith("data:") || /^https?:/.test(ref)) continue;
  const target = ref.startsWith("/") ? path.join(publicDir, ref) : path.join(publicDir, ref);
  if (!existsSync(target)) failures.push(`public/styles.css: missing ${ref}`);
}

if (failures.length) {
  console.error(`check failed with ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`check passed: ${pages.length} pages, ${files.length} files scanned`);
