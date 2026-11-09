import assert from "node:assert/strict";
import test from "node:test";

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

const worker = (await import("../src/index.js")).default;
const ctx = { waitUntil: (promise) => promise };
const assets = {
  fetch: async () => new Response("static asset", { status: 200, headers: { "Content-Type": "text/html" } })
};
const env = { ASSETS: assets };

function call(path, method = "GET") {
  return worker.fetch(new Request(`https://site.test${path}`, { method }), env, ctx);
}

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
    assert.equal(response.headers.get("Location").startsWith("https://github.com/konethegreat/agentos-studio/releases/download/v0.13.0/"), true);
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

test("the latest redirect goes to the release page", async () => {
  const response = await call("/download/latest");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "https://github.com/konethegreat/agentos-studio/releases/tag/v9.9.9");
});
