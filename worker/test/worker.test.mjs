import assert from "node:assert/strict";
import test from "node:test";
import fallback from "../src/release-fallback.json" with { type: "json" };

const store = new Map();
globalThis.caches = {
  default: {
    async match(request) {
      const hit = store.get(request.url);
      return hit ? hit.clone() : undefined;
    },
    async put(request, response) {
      store.set(request.url, response.clone());
    }
  }
};

const release = {
  tag_name: "v9.9.9",
  published_at: "2026-11-09T13:43:18Z",
  html_url: "https://github.com/konethegreat/agentos-studio/releases/tag/v9.9.9",
  assets: [
    {
      name: "AgentOS.Studio_9.9.9_x64-setup.exe",
      size: 100,
      browser_download_url:
        "https://github.com/konethegreat/agentos-studio/releases/download/v9.9.9/AgentOS.Studio_9.9.9_x64-setup.exe"
    },
    {
      name: "AgentOS.Studio_9.9.9_aarch64.dmg",
      size: 300,
      browser_download_url:
        "https://github.com/konethegreat/agentos-studio/releases/download/v9.9.9/AgentOS.Studio_9.9.9_aarch64.dmg"
    }
  ]
};

let fetches = 0;
globalThis.fetch = async () => {
  fetches += 1;
  return new Response(JSON.stringify(release), { headers: { "Content-Type": "application/json" } });
};

const { default: worker, stampVersion } = await import("../src/index.js");
const ctx = { waitUntil: (promise) => promise };
const videoBytes = new Uint8Array(100).map((_, i) => i);
const assets = {
  fetch: async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/assets/video/")) {
      return new Response(videoBytes, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "ETag": "\"video-1\"",
          "Cache-Control": "public, max-age=31536000, immutable"
        }
      });
    }
    return new Response("static asset", { status: 200, headers: { "Content-Type": "text/html" } });
  }
};
const env = { ASSETS: assets };

function call(path, method = "GET", headers = {}) {
  return worker.fetch(new Request(`https://site.test${path}`, { method, headers }), env, ctx);
}

test("serves video byte ranges so the player can seek", async () => {
  const full = await call("/assets/video/studio-demo.mp4");
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("Accept-Ranges"), "bytes");
  assert.equal(full.headers.get("Content-Type"), "video/mp4");
  assert.equal((await full.arrayBuffer()).byteLength, 100);

  const partial = await call("/assets/video/studio-demo.mp4", "GET", { Range: "bytes=10-19" });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get("Content-Range"), "bytes 10-19/100");
  assert.equal(partial.headers.get("Content-Length"), "10");
  assert.deepEqual(new Uint8Array(await partial.arrayBuffer()), videoBytes.slice(10, 20));

  const tail = await call("/assets/video/studio-demo.mp4", "GET", { Range: "bytes=-10" });
  assert.equal(tail.status, 206);
  assert.equal(tail.headers.get("Content-Range"), "bytes 90-99/100");

  const open = await call("/assets/video/studio-demo.mp4", "GET", { Range: "bytes=90-" });
  assert.equal(open.status, 206);
  assert.equal(open.headers.get("Content-Range"), "bytes 90-99/100");

  const beyond = await call("/assets/video/studio-demo.mp4", "GET", { Range: "bytes=200-250" });
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers.get("Content-Range"), "bytes */100");
});

test("ignores a range when the player holds an older copy", async () => {
  const stale = await call("/assets/video/studio-demo.mp4", "GET", { Range: "bytes=10-19", "If-Range": "\"video-0\"" });
  assert.equal(stale.status, 200);
  assert.equal((await stale.arrayBuffer()).byteLength, 100);

  const current = await call("/assets/video/studio-demo.mp4", "GET", { Range: "bytes=10-19", "If-Range": "\"video-1\"" });
  assert.equal(current.status, 206);
});

test("redirects a platform path to the matching latest asset", async () => {
  const response = await call("/download/windows");
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("Location"),
    "https://github.com/konethegreat/agentos-studio/releases/download/v9.9.9/AgentOS.Studio_9.9.9_x64-setup.exe"
  );
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("accepts aliases, trailing slashes and upper-case flavors", async () => {
  const mac = await call("/download/osx/");
  assert.equal(mac.headers.get("Location").endsWith("_aarch64.dmg"), true);
  const win = await call("/download/Win");
  assert.equal(win.headers.get("Location").endsWith("_x64-setup.exe"), true);
});

test("unknown flavors return to the download page instead of redirecting off site", async () => {
  const response = await call("/download/solaris");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/download/");
});

test("serves the release manifest with CORS and cache headers", async () => {
  const response = await call("/api/releases");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  const body = await response.json();
  assert.equal(body.version, "9.9.9");
  assert.equal(body.assets.windows.size, 100);
});

test("falls back to the checked-in manifest when GitHub fails", async () => {
  store.clear();
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network down");
  };
  try {
    const response = await call("/download/windows");
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), fallback.assets.windows.url, "the fallback is whatever sync:release checked in");
  } finally {
    globalThis.fetch = original;
  }
});

test("caches the GitHub answer instead of calling it on every download", async () => {
  store.clear();
  fetches = 0;
  await call("/download/windows");
  await call("/download/windows");
  assert.equal(fetches, 1);
});

test("rejects writes and passes static paths to the assets binding", async () => {
  const write = await call("/download/windows", "POST");
  assert.equal(write.status, 405);
  assert.equal(await write.json().then((body) => body.allow), "GET, HEAD");

  const page = await call("/download/");
  assert.equal(await page.text(), "static asset");
});

test("every page carries the latest version before any script runs", async () => {
  const html = '<p>Version <b class="js-version">1.0.0</b></p><code>AgentOS.Studio_<span class="js-version">1.0.0</span>_x64-setup.exe</code>';
  assert.equal(
    stampVersion(html, "1.2.6"),
    '<p>Version <b class="js-version">1.2.6</b></p><code>AgentOS.Studio_<span class="js-version">1.2.6</span>_x64-setup.exe</code>'
  );
  assert.equal(stampVersion(html, "<script>"), html, "a version that is not a version is ignored");
  const served = env.ASSETS;
  env.ASSETS = { fetch: async () => new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }) };
  try {
    const res = await call("/setup/");
    const body = await res.text();
    assert.ok(body.includes('class="js-version">9.9.9<'), body);
    assert.ok(!body.includes("1.0.0"));
  } finally {
    env.ASSETS = served;
  }
});

test("the latest redirect goes to the release page", async () => {
  const response = await call("/download/latest");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://github.com/konethegreat/agentos-studio/releases/tag/v9.9.9");
});
