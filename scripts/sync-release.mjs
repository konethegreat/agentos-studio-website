import { writeFile } from "node:fs/promises";
import { normalizeRelease } from "../worker/src/map.js";

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
