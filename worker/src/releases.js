// The Worker reads the latest GitHub release and falls back to the manifest in
// release-fallback.json when GitHub is unreachable or rate limited.

import FALLBACK from "./release-fallback.json" with { type: "json" };
import { RELEASE_PAGE, normalizeRelease, pickAsset, publicManifest } from "./map.js";

export { ALIASES, DOWNLOAD_PREFIX, FLAVORS, REPO, isTrustedDownload, normalizeRelease, pickAsset, publicManifest } from "./map.js";

export const RELEASE_API = "https://api.github.com/repos/konethegreat/agentos-studio/releases/latest";
export { RELEASE_PAGE };

const USER_AGENT = "agentos-studio-website (+https://github.com/konethegreat/agentos-studio)";
const CACHE_KEY = "https://agentos-studio-website.internal/releases/latest.json";

export async function latestRelease(ctx) {
  const cache = caches.default;
  const cached = await cache.match(new Request(CACHE_KEY));
  if (cached) {
    try {
      return await cached.json();
    } catch {
      // A corrupt cache entry falls through to a fresh fetch.
    }
  }

  try {
    const response = await fetch(RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "Accept-Language": "en",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28"
      },
      cf: { cacheTtl: 600, cacheEverything: true }
    });
    if (response.ok) {
      const manifest = normalizeRelease(await response.json());
      if (manifest) {
        const stored = new Response(JSON.stringify(manifest), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=900"
          }
        });
        ctx.waitUntil(cache.put(new Request(CACHE_KEY), stored));
        return manifest;
      }
    }
  } catch {
    // Network failure: use the checked-in manifest.
  }

  return FALLBACK;
}
