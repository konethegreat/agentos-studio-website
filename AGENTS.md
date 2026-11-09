# AgentOS website rules

These rules apply to this repository. They add detail to the AgentOS constitution and never weaken it.

## Authorship

Every page must carry the visible credit "Kone Tshivhinda" and "K-ONE IT SOLUTIONS", plus
`<meta name="author" content="Kone Tshivhinda and K-ONE IT SOLUTIONS">`. `npm run check` fails the
build when a page is missing either name.

## Attribution

`library/` components from the UI Vault may be reused with credit and their MIT notice, in the page
footer and on `/credits/`. Components from the UI Vault `references/` tier are never copied here
without a verified permissive license and a visible author credit. When in doubt, link instead of
copying.

## Stack

- No framework and no build step for the pages. Plain HTML, CSS and small modules.
- The Worker maps download routes and serves the static assets binding.
- Node 22 or newer. Wrangler 4 for preview and deploy.
- Release asset URLs must come from the repository's own release download path. Never redirect to
  an arbitrary URL supplied by an API response.

## Gates

Run `npm test`, `npm run check` and `npm run dry-run` before opening a pull request. CI runs the
same. A pull request that changes a page also attaches a screenshot of the page at desktop width.

## Secrets and deployment

Never commit Cloudflare tokens, account ids, `.dev.vars`, or anything from the owner's dashboard.
Deployment only happens when the owner provides credentials through an approved channel; the
repository stays deployable without them. Preview is local until then.

## Style

No em dashes or en dashes anywhere. No placeholder markers. Plain, specific copy. State what an
install does and what a dialog says; do not promise that no dialog appears. No analytics, cookies
or third-party scripts on the site.
