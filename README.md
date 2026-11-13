# AgentOS Studio website

The download site for [AgentOS Studio](https://github.com/konethegreat/agentos-studio). A Cloudflare
Worker serves static pages and resolves `/download/<os>` to the installers on the latest GitHub
release.

Status: **live** at https://agentos-studio-website.erictshivhinda.workers.dev (first deploy
2026-11-11). Deploying uses the owner's Wrangler login on his machine; no credential is in this
repository and none ever will be.

Authors: **Kone Tshivhinda** and **K-ONE IT SOLUTIONS**, Johannesburg. Every page carries both names
in the footer and in its author metadata.

## Stack

- Cloudflare Workers with static assets (`wrangler.jsonc`), no framework and no build step.
- Plain HTML, CSS and two small browser scripts: `public/app.js` (OS detection, release data, the
  ported UI Vault interactions, setup guide progress) and `public/nebula.js` (the WebGL hero).
- App screenshots live in `public/assets/screens/` as WebP. The 84 second product tour lives in
  `public/assets/video/` as `studio-demo.mp4` (H.264, 1920x1080, 19.4 MB, recorded in the light
  theme) with `studio-demo-poster.jpg`. UI Vault and Magic UI components are credited on `/credits/`;
  only MIT entries are reused.
- Worker entry: `worker/src/index.js`. Release mapping and tests: `worker/src/map.js`.
- Node 22 or newer for tests and tooling. Wrangler 4 for local preview and deploy.

## Pages

| Path | File | Purpose |
| --- | --- | --- |
| `/` | `public/index.html` | Nebula hero, feature cards, the product tour video with chapter jumps and a sound toggle, app screenshots, mission flow, OS-detecting download section, setup path |
| `/setup/` | `public/setup/index.html` | Step by step guide for non-technical users on Windows, macOS and Linux: download, installer prompts, first launch, Setup screen (1.0 and 1.1), sign-ins, first chat and goal, troubleshooting |
| `/download/` | `public/download/index.html` | Installers per platform, unsigned build steps, requirements |
| `/privacy/` | `public/privacy/index.html` | What this site collects (nothing) and what Cloudflare sees |
| `/credits/` | `public/credits/index.html` | Authorship, UI Vault components, fonts, what is not copied |
| `/404` | `public/404.html` | Not found page |

## Routes served by the Worker

| Route | Behaviour |
| --- | --- |
| `GET /api/releases` | Latest release as JSON, cached at the edge, CORS open |
| `GET /download/windows` | Redirect to the latest `x64-setup.exe` |
| `GET /download/windows-msi` | Redirect to the latest MSI |
| `GET /download/macos` or `/download/macos-arm64` | Redirect to the latest Apple Silicon DMG |
| `GET /download/macos-x64` | Redirect to the latest Intel DMG |
| `GET /download/linux` or `/download/linux-appimage` | Redirect to the latest AppImage |
| `GET /download/linux-deb` | Redirect to the latest deb |
| `GET /download/linux-rpm` | Redirect to the latest rpm |
| `GET /download/latest` | Redirect to the latest release page |
| Unknown platform | Redirect to `/download/` |
| `GET /assets/video/*` | The product tour video with byte range support: answers `Range` with `206` and `Content-Range` so the player can seek, `416` past the end, and the whole file when `If-Range` names an older copy |

Aliases (`win`, `mac`, `osx`, `appimage`, `deb`, `rpm`, `msi`) are mapped in
`worker/src/map.js`. Asset URLs are only accepted when they start with the repository's release
download prefix, so a hostile or malformed API response cannot redirect off GitHub.

Workers static assets answer `Range` requests with the whole file, which leaves the video player
with nothing to seek into. The Worker therefore owns `/assets/video/*`: it fetches the file from the
assets binding, then slices the requested bytes itself. `worker/test/worker.test.mjs` covers plain,
suffix, open ended, past the end and stale `If-Range` cases.

The product tour section on `/` starts muted with a poster overlay and a play button. The chapter
buttons under the player jump to Today, Chat, Work, Brain, Code and System, and the sound button
unmutes the beat. Times are 4.8, 9.6, 14.4, 43.2, 55.2 and 62.4 seconds in the 84 second cut.

The Worker asks `https://api.github.com/repos/konethegreat/agentos-studio/releases/latest`, caches
the answer for 15 minutes at the edge, and falls back to `worker/src/release-fallback.json` when
GitHub is unreachable or rate limited. Run `npm run sync:release` after each release to refresh the
fallback.

## Commands

```bash
npm install
npm run dev        # wrangler dev on http://localhost:8787
npm test           # node:test for the release mapping and Worker routes
npm run check      # credits, links, CSP, dashes, placeholder markers, fallback manifest
npm run dry-run    # bundle the Worker without deploying
npm run deploy     # deploy, only with Cloudflare credentials present
npm run sync:release
```

Run `npm test` and `npm run check` before every pull request. CI runs the same two commands plus a
Wrangler dry run.

## Deploy

```bash
npx wrangler login
npm run deploy
```

The Worker name is `agentos-studio-website`. With the owner's account it answers on
`agentos-studio-website.<account>.workers.dev`. Do not commit tokens, account ids or `.dev.vars`.
Set the GitHub repository homepage to the deployed URL after the first deploy, not before.

## Credits and license

The Button and Nebula Hero patterns come from the [UI Vault](https://github.com/konethegreat/ui-vault)
`library/` tier, MIT, by Kone Tshivhinda. The site re-themes them to paper, ink and cornflower and
credits them on `/credits/` and in every footer. Fonts are Instrument Serif, Geist and Geist Mono
under the SIL Open Font License 1.1; the license ships at `public/fonts/OFL.txt`. No component from
the UI Vault `references/` tier is copied here.

The site code is MIT licensed.
