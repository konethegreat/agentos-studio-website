# AgentOS Studio website

The download site for [AgentOS Studio](https://github.com/konethegreat/agentos-studio). A Cloudflare
Worker serves static pages and resolves `/download/<os>` to the installers on the latest GitHub
release.

Status: **preview**. The site runs locally and has no public deployment yet. Deploying needs the
owner's Cloudflare credentials, which are not in this repository and never will be.

Authors: **Kone Tshivhinda** and **K-ONE IT SOLUTIONS**, Johannesburg. Every page carries both names
in the footer and in its author metadata.

## Stack

- Cloudflare Workers with static assets (`wrangler.jsonc`), no framework and no build step.
- Plain HTML, CSS and two small browser scripts.
- Worker entry: `worker/src/index.js`. Release mapping and tests: `worker/src/map.js`.
- Node 22 or newer for tests and tooling. Wrangler 4 for local preview and deploy.

## Pages

| Path | File | Purpose |
| --- | --- | --- |
| `/` | `public/index.html` | What AgentOS Studio is, three surfaces, mission flow, install path |
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

Aliases (`win`, `mac`, `osx`, `appimage`, `deb`, `rpm`, `msi`) are mapped in
`worker/src/map.js`. Asset URLs are only accepted when they start with the repository's release
download prefix, so a hostile or malformed API response cannot redirect off GitHub.

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
