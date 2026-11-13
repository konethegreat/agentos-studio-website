import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRelease } from "../worker/src/map.js";
import { stampVersion } from "../worker/src/index.js";

const API = "https://api.github.com/repos/konethegreat/agentos-studio/releases/latest";
const TARGET = new URL("../worker/src/release-fallback.json", import.meta.url);

const response = await fetch(API, {
  headers: {
    Accept: "application/vnd.github+json",
    "User-Agent": "agentos-studio-website-sync",
    "X-GitHub-Api-Version": "2022-11-28"
  }
});

if (!response.ok) {
  console.error(`GitHub returned ${response.status} for ${API}`);
  process.exit(1);
}

const manifest = normalizeRelease(await response.json());
if (!manifest) {
  console.error("The latest release has no installers this site understands.");
  process.exit(1);
}

await writeFile(TARGET, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifest.tag} with ${Object.keys(manifest.assets).length} assets to ${TARGET.pathname}`);

// The pages carry the version too (the Worker stamps it on every request; this keeps the files
// right for local preview and for anyone reading the source).
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
async function pages(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await pages(full)));
    else if (e.name.endsWith(".html")) out.push(full);
  }
  return out;
}
for (const file of await pages(publicDir)) {
  const before = await readFile(file, "utf8");
  const after = stampVersion(before, manifest.version);
  if (after !== before) {
    await writeFile(file, after);
    console.log(`Stamped ${manifest.version} into ${file}`);
  }
}
