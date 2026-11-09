import assert from "node:assert/strict";
import test from "node:test";

import {
  FLAVORS,
  isTrustedDownload,
  normalizeRelease,
  pickAsset,
  publicManifest
} from "../src/map.js";

const tag = "v9.9.9";
const base = `https://github.com/konethegreat/agentos-studio/releases/download/${tag}`;

const release = {
  tag_name: tag,
  published_at: "2026-11-09T13:43:18Z",
  html_url: "https://github.com/konethegreat/agentos-studio/releases/tag/v9.9.9",
  assets: [
    { name: "AgentOS.Studio_9.9.9_x64-setup.exe", size: 100, browser_download_url: `${base}/AgentOS.Studio_9.9.9_x64-setup.exe` },
    { name: "AgentOS.Studio_9.9.9_x64-setup.exe.sig", size: 1, browser_download_url: `${base}/AgentOS.Studio_9.9.9_x64-setup.exe.sig` },
    { name: "AgentOS.Studio_9.9.9_x64_en-US.msi", size: 200, browser_download_url: `${base}/AgentOS.Studio_9.9.9_x64_en-US.msi` },
    { name: "AgentOS.Studio_9.9.9_aarch64.dmg", size: 300, browser_download_url: `${base}/AgentOS.Studio_9.9.9_aarch64.dmg` },
    { name: "AgentOS.Studio_9.9.9_x64.dmg", size: 400, browser_download_url: `${base}/AgentOS.Studio_9.9.9_x64.dmg` },
    { name: "AgentOS.Studio_9.9.9_amd64.AppImage", size: 500, browser_download_url: `${base}/AgentOS.Studio_9.9.9_amd64.AppImage` },
    { name: "AgentOS.Studio_9.9.9_amd64.deb", size: 600, browser_download_url: `${base}/AgentOS.Studio_9.9.9_amd64.deb` },
    { name: "AgentOS.Studio-9.9.9-1.x86_64.rpm", size: 700, browser_download_url: `${base}/AgentOS.Studio-9.9.9-1.x86_64.rpm` },
    { name: "latest.json", size: 10, browser_download_url: `${base}/latest.json` },
    { name: "AgentOS.Studio_9.9.9_amd64.deb", size: 600, browser_download_url: "https://example.com/evil.deb" }
  ]
};

test("normalizes every installer flavor and ignores signatures and foreign URLs", () => {
  const manifest = normalizeRelease(release);
  assert.equal(manifest.version, "9.9.9");
  assert.deepEqual(Object.keys(manifest.assets).sort(), Object.keys(FLAVORS).sort());
  assert.equal(manifest.assets.windows.size, 100);
  assert.equal(manifest.assets.linuxAppImage, undefined);
  assert.equal(manifest.assets["linux-rpm"].name, "AgentOS.Studio-9.9.9-1.x86_64.rpm");
  assert.equal(isTrustedDownload(manifest.assets.windows.url), true);
});

test("rejects releases without a usable version or trusted assets", () => {
  assert.equal(normalizeRelease(null), null);
  assert.equal(normalizeRelease({ tag_name: "nightly" }), null);
  assert.equal(normalizeRelease({ tag_name: "v1.0.0", assets: [] }), null);
  assert.equal(
    normalizeRelease({
      tag_name: "v1.0.0",
      assets: [{ name: "x_x64-setup.exe", browser_download_url: "https://example.com/x.exe" }]
    }),
    null
  );
});

test("resolves aliases to the expected installer", () => {
  const manifest = normalizeRelease(release);
  assert.equal(pickAsset(manifest, "win").flavor, "windows");
  assert.equal(pickAsset(manifest, "Windows").flavor, "windows");
  assert.equal(pickAsset(manifest, "mac").flavor, "macos-arm64");
  assert.equal(pickAsset(manifest, "osx").size, 300);
  assert.equal(pickAsset(manifest, "macos-intel").size, 400);
  assert.equal(pickAsset(manifest, "linux").flavor, "linux-appimage");
  assert.equal(pickAsset(manifest, "deb").size, 600);
  assert.equal(pickAsset(manifest, "msi").size, 200);
  assert.equal(pickAsset(manifest, "rpm").size, 700);
  assert.equal(pickAsset(manifest, "solaris"), null);
  assert.equal(pickAsset(manifest, ""), null);
  assert.equal(pickAsset(null, "windows"), null);
});

test("public manifest carries versions, flavors and no internals", () => {
  const manifest = normalizeRelease(release);
  const published = publicManifest(manifest);
  assert.equal(published.version, "9.9.9");
  assert.equal(published.page, release.html_url);
  assert.equal(published.flavors.windows.match, "_x64-setup.exe");
  assert.ok(published.generatedAt);
  assert.equal(published.assets.windows.url.startsWith("https://github.com/konethegreat/agentos-studio/releases/download/"), true);
});
