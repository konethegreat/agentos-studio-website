// Pure release mapping shared by the Worker, the fallback sync script and the tests.

export const REPO = "konethegreat/agentos-studio";
export const RELEASE_PAGE = `https://github.com/${REPO}/releases/latest`;
export const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;

export const FLAVORS = {
  windows: { label: "Windows installer", hint: "Windows 10 and 11, x64", match: "_x64-setup.exe" },
  "windows-msi": { label: "Windows MSI", hint: "Managed installs, x64", match: "_x64_en-US.msi" },
  "macos-arm64": { label: "macOS (Apple Silicon)", hint: "M1 and later", match: "_aarch64.dmg" },
  "macos-x64": { label: "macOS (Intel)", hint: "Intel Macs", match: "_x64.dmg" },
  "linux-appimage": { label: "Linux AppImage", hint: "Portable, x64", match: "_amd64.AppImage" },
  "linux-deb": { label: "Linux .deb", hint: "Debian, Ubuntu, x64", match: "_amd64.deb" },
  "linux-rpm": { label: "Linux .rpm", hint: "Fedora, RHEL, x64", match: "x86_64.rpm" }
};

export const ALIASES = {
  windows: "windows",
  win: "windows",
  "windows-x64": "windows",
  "windows-setup": "windows",
  msi: "windows-msi",
  "windows-msi": "windows-msi",
  macos: "macos-arm64",
  mac: "macos-arm64",
  osx: "macos-arm64",
  "macos-arm64": "macos-arm64",
  "macos-apple-silicon": "macos-arm64",
  "macos-silicon": "macos-arm64",
  "macos-x64": "macos-x64",
  "macos-intel": "macos-x64",
  linux: "linux-appimage",
  "linux-x64": "linux-appimage",
  "linux-appimage": "linux-appimage",
  appimage: "linux-appimage",
  deb: "linux-deb",
  "linux-deb": "linux-deb",
  rpm: "linux-rpm",
  "linux-rpm": "linux-rpm"
};

export function isTrustedDownload(url) {
  return typeof url === "string" && url.startsWith(DOWNLOAD_PREFIX) && !/\s/.test(url);
}

export function normalizeRelease(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.tag_name !== "string") return null;
  const version = raw.tag_name.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) return null;

  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  const find = (suffix) =>
    assets.find(
      (asset) =>
        asset &&
        typeof asset.name === "string" &&
        asset.name.endsWith(suffix) &&
        !asset.name.endsWith(".sig") &&
        isTrustedDownload(asset.browser_download_url)
    );

  const mapped = {};
  for (const [flavor, spec] of Object.entries(FLAVORS)) {
    const asset = find(spec.match);
    if (!asset) continue;
    mapped[flavor] = {
      name: asset.name,
      size: Number.isFinite(asset.size) ? asset.size : null,
      url: asset.browser_download_url
    };
  }

  if (Object.keys(mapped).length === 0) return null;

  return {
    version,
    tag: raw.tag_name,
    publishedAt: typeof raw.published_at === "string" ? raw.published_at : null,
    page:
      typeof raw.html_url === "string" && raw.html_url.startsWith(`https://github.com/${REPO}/releases/`)
        ? raw.html_url
        : RELEASE_PAGE,
    assets: mapped
  };
}

export function pickAsset(manifest, flavor) {
  if (!manifest || !manifest.assets) return null;
  const key = ALIASES[String(flavor || "").trim().toLowerCase()];
  if (!key) return null;
  const asset = manifest.assets[key];
  return asset && isTrustedDownload(asset.url) ? { flavor: key, ...asset } : null;
}

export function publicManifest(manifest) {
  return {
    version: manifest.version,
    tag: manifest.tag,
    publishedAt: manifest.publishedAt,
    page: manifest.page,
    generatedAt: new Date().toISOString(),
    flavors: FLAVORS,
    assets: manifest.assets
  };
}
