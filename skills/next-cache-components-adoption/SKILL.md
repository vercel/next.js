---
name: next-cache-components-adoption
description: >
  Turn on Cache Components in a Next.js app and resolve the blocking routes it
  surfaces. Use when the user wants to enable, adopt, or migrate to Cache
  Components, flip the `cacheComponents` flag, work through a flood of
  blocking-prerender / instant validation errors, run the
  `cache-components-instant-false` codemod, or decide between opting routes out
  with `export const instant = false` and fixing them in place.
---

# next-cache-components-adoption

Enable Cache Components on an app and walk it to a clean build. This skill **sequences** the work; per-error recipes live in the dev overlay fix cards and the build's terminal output. The [migrating to Cache Components guide](https://nextjs.org/docs/app/guides/migrating-to-cache-components) is the canonical reference for the concepts and per-API recipes this skill applies — consult it whenever the skill steps reference a pattern (`"use cache"`, `cacheLife`, `<Suspense>` placement, etc.) and you want the full explanation.

## requires

Confirm each item before starting milestone A. The skill won't apply cleanly if any are unmet.

- **App Router project.** Cache Components is an App Router feature; `cacheComponents: true` does nothing for `pages/` routes. If the project has a `pages/` or `src/pages/` tree but no `app/` or `src/app/` tree, stop and tell the user — Pages → App migration is its own project, not part of this skill. A hybrid app (both `pages/` and `app/`) is fine: the flag affects the `app/` routes; `pages/` routes are unaffected and don't need opt-outs.

- **Next.js 16.3 or later.** That release is where the pieces this skill relies on land: top-level `cacheComponents`, `export const instant`, the dev-overlay instant-navigation validation warnings, and the `cache-components-instant-false` codemod. If `next --version` reports below 16.3, upgrade first:
  - `npx @next/codemod@latest upgrade latest` to apply the version-to-version codemods.
  - Read the relevant [version upgrade guide](https://nextjs.org/docs/app/guides/upgrading) (e.g. [Version 16](https://nextjs.org/docs/app/guides/upgrading/version-16)) for what the codemod doesn't cover.

- **No incompatible config keys.** `cacheComponents: true` errors on any file that still exports `dynamic`, `revalidate`, or `fetchCache`, and the renamed `experimental.dynamicIO` is a hard config error on 16.3+ (`experimental.useCache` still works as a deprecated alias that maps to `cacheComponents`, but migrate it for clarity). **Translate, don't delete.** Each of these exports encodes behavior the route needs to keep doing — `revalidate = 3600` is a one-hour cache lifetime, `force-dynamic` is a request-time read, `fetchCache` is a per-route default for `fetch()` calls. Migrate each one to its Cache Components equivalent via the [migration guide's "Enable Cache Components" section](https://nextjs.org/docs/app/guides/migrating-to-cache-components#enable-cache-components) — that's the source of truth for the per-key mappings. If a value can't be cleanly translated right now (e.g. you don't know the right cache lifetime yet), leave a `// TODO: Cache Components adoption — restore revalidate = 3600` comment in place so milestone B picks it up; don't drop the number on the floor.

### notes

- **No green baseline before the flag.** If the app already uses `"use cache"`, the pre-flag build errors with `please enable the feature flag cacheComponents`. Enabling the flag is the first step of milestone A, not a thing to do _after_ getting green; the green baseline comes from milestone A (blanket the opt-outs in), not from before it. Note this in your starting summary so it doesn't read as a regression.

- **Offline docs.** Offline copies of guide links live under `node_modules/next/dist/docs/`, with the directory layout numbered for ordering (e.g. `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`). The trailing filename matches the slug. If you can't predict the numbered prefix, `find node_modules/next/dist/docs -name '<slug>.md'` resolves it. The `/docs/messages/*` error pages are not bundled. If offline docs are missing entirely, run `npx @next/codemod@latest agents-md` to write a version-matched index into `AGENTS.md` / `CLAUDE.md`.

## the shape of the work

Adoption has two milestones. Each is shippable on its own:

- **A. Green build.** `next build` passes with `cacheComponents: true` — blanket `instant = false` if needed. Setup for B. (steps 1–2.)
- **B. Remove `instant = false`.** **This is the loop where adoption happens.** Walk the route tree top-down, one subtree at a time, removing each opt-out and either making the route prerenderable or documenting it as a deliberate Block — checking in with the user at each subtree boundary. Expect to spend most of the time here. (steps 2–3.)

**Adoption is complete after B.** Further optimization — making navigations instant, adopting Partial Prefetching, locking the result in with e2e tests, growing static shells — is covered by the linked guides in [further reading](#further-reading). Point the user at them; this skill doesn't walk through them.

**End of every milestone: summarize and ask.** Tell the user which routes changed and how (cached / wrapped in `<Suspense>` / opted out as a documented Block), what they should sanity-check, and ask whether to open a PR before continuing. Each milestone is a real checkpoint, not a step inside one agent run. Don't silently roll on.

## background

`cacheComponents: true` requires every route to be prerenderable. A route that reads request-time data outside `<Suspense>` is "blocking" and **fails the build**. `export const instant = false` marks a route as allowed to block, which clears it in both dev and build; on a layout it covers the whole subtree beneath it. Reads wrapped in a [`"use cache"`](https://nextjs.org/docs/app/api-reference/directives/use-cache) function count as cache boundaries, not blocking reads.

## working surfaces

### finding blocking routes

Prefer `next dev` over `next build` while you work.

- **`next dev`** — the dev overlay surfaces blocking errors one route at a time, with full stack traces and fix cards linking the per-error docs. Work one route at a time; the route itself still returns HTTP 200, so read the overlay (or `.next-dev.log`), not status codes.
- **`next build`** — confirms milestone A (green build) and spot-checks milestone B (no opt-outs left). Useful when `next dev` isn't available. By default it stops at the first blocking route, so iterating purely on builds means fix → rebuild → next error. Two flags help: `--debug-build-paths` builds only the routes you name (comma-separated file-path globs relative to the project root, e.g. `app/admin/**/page.tsx` — not URL paths), and `--debug-prerender` disables the early-exit so the build keeps going past the first failure and reports every blocking route with a fuller stack trace.

### verifying each fix at runtime

A green build or a cleared overlay isn't proof the route actually behaves — Cache Components is a runtime concern (a static shell with streamed data). Load the route in a real browser, wait for streaming to settle, confirm it renders. **Verify after every fix, not only at the end.**

In preference order:

1. **[`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) — strongly preferred.** Cross-checks `/_next/mcp` against the live browser via `agent-browser` and surfaces both compile and runtime issues in one pass. The diagnostics (React tree, suspense boundaries, console + network) are orders of magnitude richer than poking at `next dev` by hand.

   **Install it before starting milestone B.** Don't wait until you hit something `next dev` alone can't explain. Run:

   ```bash
   npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop
   ```

   The skill requires Turbopack and `agent-browser >= 0.27.0` and walks you through both.

   **You don't need permission to install it.** It's a tool, like installing a dev dependency. If a user is on the line, briefly tell them you're installing it for verification. In a non-interactive run (CI, dashboard, sandbox), install it without asking — "can't prompt the user" is not a reason to skip. The only legitimate skip is a real technical blocker: no network, no npm, read-only filesystem, or a stated no-new-deps policy. If you skip, name the specific blocker in your final report.

2. **A browser you can drive yourself.** Playwright, `agent-browser` directly, any browser-automation tool. Use only when `next-dev-loop` is genuinely blocked. You'll miss the framework-side checks (`/_next/mcp`), so DOM assertions alone don't catch every regression — be more cautious about what you call "verified."

3. **Build-only.** If you can't run a dev server at all, the build is your only signal. `○ (Static)` routes with no `<Suspense>` are fully verified by the build (nothing streamed to test). `◐ (Partial Prerender)` routes are only shell-verified — flag them when you report back. Don't pretend a green build covers behavioral verification of streamed content.

4. **No tooling at all.** Ask the user to run the dev server (or build) and report what they see, or commit the milestone you've reached and hand off. Be explicit about what you couldn't verify.

## step 1: choose a strategy

Ask the user; don't assume. **In a non-interactive run** (no way to prompt), default to **Blanket** for a multi-route app and **Direct** for a single-route or handful-of-routes app, and say so when you start.

- **Blanket** — run the codemod to opt every page and layout out, get a clean build immediately, **merge that**, then remove the opt-outs feature by feature in follow-up PRs. Use for large apps, team repos (a long-lived failing branch blocks others), or when you can't land every route in one PR.
- **Direct** — enable the flag and fix every route in place in one pass. Use for small or solo apps where one PR is realistic.

### blanket

**Blanket only clears `instant = false` errors. Sync-IO reads in a shared layout will still fail the build after the codemod runs.** Before invoking the codemod, grep the whole repo for `new Date()`, `Date.now()`, `Math.random()`, and `crypto.randomUUID()` — not just `app/**/layout.{js,jsx,ts,tsx}`. The blocking read might live in any component imported by a layout (e.g. `components/site-footer.tsx`); the build error names the leaf file, but the layout is what blocks. Each match has to be fixed using the recipe from its `blocking-prerender-*` error card before milestone A can go green; a layout with two distinct reads (e.g. a copyright year and a "last updated" stamp) usually needs two distinct fixes (cache for the stable one, `await connection()` + `<Suspense>` for the per-request one).

The codemod refuses to run on a dirty working tree. Before invoking it, commit or stash unrelated work — or be ready to pass `--force` (which lets the codemod's edits land alongside your WIP). Common false positive: if you just upgraded Next.js, `package.json` and the lockfile will already be dirty; commit those first.

**Use the `@canary` channel, not `@latest`.** The `cache-components-instant-false` transform isn't in the stable `@next/codemod` release yet; `@next/codemod@latest` will error with `Invalid transform choice`. Use the command exactly as written below.

```bash
npx @next/codemod@canary cache-components-instant-false ./app
```

Inserts `export const instant = false` (with a `// TODO: Cache Components adoption` comment) into every `app/**/{page,layout,default}` file, skipping files that already declare `instant` and any module marked `"use client"` or `"use server"`. Then set `cacheComponents: true`. The TODO comments are the work queue for milestone B.

**If the codemod isn't available** (older `@next/codemod`, sandboxed environment, offline run), reproduce it by hand: for every `app/**/{page,layout,default}.{js,jsx,ts,tsx}` that isn't `"use client"` or `"use server"` and doesn't already declare or export `instant` in any form, insert the three-line block below after the file's import statements (or at the top, if there are none):

```ts
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false
```

Then set `cacheComponents: true`. The result is the same as what the codemod produces.

The codemod opts **every** segment out, not only the root, on purpose. Resolution is top-down, first-explicit-config-wins: the **highest** `instant = false` in a route's tree decides the whole subtree, and deeper ones are never read. If you only opted the root layout out, removing it would re-arm validation for the entire app at once. With an opt-out on every segment, removing one segment's opt-out validates only **that** segment — its descendants keep their own opt-outs and stay green, so the blast radius is one segment at a time.

Because the highest opt-out wins, **remove them top-down** (root first, then descend). Removing a leaf's opt-out does nothing while an ancestor still holds one.

**Confirm milestone A with a build.** Run `next build` and make sure it completes with no blocking-route errors before you call the green build done. The codemod gets you most of the way, but a shared layout that calls `new Date()` / `Math.random()` directly still fails regardless of the opt-out (see "background" above), so the build is the proof, not the codemod run.

After running the codemod, **confirm the root layout got an opt-out** (`grep -n "export const instant" app/layout.*`). The root layout is the one segment that must be covered: it renders every route, including framework routes like `/_not-found`, so if it still reads `cookies()` without an opt-out the build fails on `/_not-found` even though no other route changed. If it was missed, add `export const instant = false` to it by hand.

**Never add `instant = false` to a synthetic route** like `/_not-found` — there is no user file for it, and the directive wouldn't apply. When `/_not-found` (or another framework route) blocks, the cause is the **root layout** it renders through; fix the opt-out there.

**Client Components (`"use client"` pages/layouts) get no opt-out** — the codemod skips them on purpose. `instant` is a Server Component route segment config; exporting it from a client module is a build error (`E1344`). They don't need one anyway: a client page is covered by its nearest server layout's opt-out, and a client page can't read server request data (`cookies()`, `headers()`, `await params`) itself, so it rarely blocks on its own. If a route with a client page still blocks, the cause is server-side data in an ancestor layout — fix the opt-out or the read there, not on the client page.

**Files with a top-level `"use cache"` directive get no opt-out either.** A file-level `"use cache"` makes the whole module a cached scope; `export const instant = false` errors with `Only async functions are allowed to be exported in a "use cache" file.` The codemod doesn't detect this case, so if you see that error after running it, look for a `"use cache"` directive at the top of the offending file. The directive is almost certainly wrong for that route — a page that reads `cookies()` / `headers()` / `await params` can't be cached wholesale. Remove the top-level `"use cache"` before applying the opt-out, and let milestone B introduce caching at the right boundary (a nested function, not the whole file).

### direct

Set `cacheComponents: true` and collect the errors. The reported routes are the work queue; there are no opt-outs to remove.

## step 2: remove opt-outs, one subtree at a time

The route tree is the work queue. Pick one subtree (`app/dashboard/**`, or a top-level app if the repo has several — marketing, app, docs), finish it end-to-end, ship it, then start the next. Each subtree is an independent, mergeable change. Don't fan out across the whole app in one pass — the point of milestone A's blanket was to make the loop incremental, not optional.

Within a subtree, walk **top-down** (layouts before the pages beneath them, root layout first). The root layout is often the hardest (it wraps `<html>` / `<body>` and frequently reads `cookies()`), but it shadows every route including framework routes like `/_not-found`, so it has to come off before anything below it can be validated. (Direct path: there are no opt-outs to remove — fix each failing route; if a hand-written opt-out on an ancestor shadows it, remove that first.)

**A green build mid-walk doesn't mean the layout is clean.** Removing a layout's opt-out while its descendant pages still have theirs keeps the build green — each page shadows the inherited validation. The layout's actual blocking reads only surface once nothing below it shadows them. So after a layout is opt-out-free, **keep going** down the subtree; if the layout has an inherent blocker, the first page you uncover will be the one to surface it. Don't call a subtree done at the layout boundary.

For each route in the subtree:

1. Remove its `instant = false` (Blanket) or target the failing route (Direct).
2. Reload it in dev or rebuild only that route. If it's clean, the route was already prerenderable — move on.
3. If it still blocks, read the error in the dev overlay and apply the fix it points at. When the call gets ambiguous — you're not sure which fix fits, the blocking code looks security-sensitive, or the user might want to keep the route blocking on purpose — read **[references/per-page-decisions.md](./references/per-page-decisions.md)** before editing. Those cases are user check-in moments, not agent judgment calls.
   - **Dynamic route gotcha:** `await params` and `searchParams` access are themselves blocking reads. Caching the downstream fetch (`getThing(id)`) isn't enough — if `await params` runs at the top of the page body, the route still blocks. Push the param read into a `<Suspense>`-wrapped child component along with whatever it fetches.
4. Re-check the route. If your fix touched shared code (a layout, a sidebar component), re-check sibling routes too — a shared-shell change can fix the route you're on and break a sibling. Then move to the next route.

Keep a todo list of the subtree's routes and work it to completion; don't truncate. When every route in the subtree is clean, move to **step 3** to verify and hand the subtree off to the user.

## step 3: verify the subtree

A checklist, not new adoption work. This is where the user signs off on the subtree before you start the next.

- `next build` completes without blocking-route errors.
- No bare `// TODO: Cache Components adoption` opt-outs are left in the subtree (`grep` to confirm). Any `instant = false` left behind must be a **deliberate, documented Block** — its comment rewritten to a reason (see [references/per-page-decisions.md](./references/per-page-decisions.md) → "when to leave a Block in place"), not the original `// TODO`.
- Drive each route in dev, not only the build. Visit it, wait for streaming to settle, confirm every `<Suspense>` fallback resolves to its real content (not stuck on a skeleton or a blank). A green build with zero opt-outs is not the same as a working route. Query the live DOM if a tool's snapshot looks stale before reporting a route as broken.
- **Show the user the rendered result.** A screenshot or the visible content you observed, per route. The build can't tell whether the streamed-in loading state, the fallback, or the final layout matches what the user wants. Adoption changes the _experience_, so the person who owns the product should sign off on each piece.

**Expect some routes to still print `ƒ` (Dynamic) in the build's route table — that is success, not a regression.** A route comes out `ƒ` when it does request-time work through the documented escape hatch (e.g. a layout that `await connection()` for `new Date()`); the page is no longer _opted out_, it is genuinely dynamic. Don't rip the escape hatch back out chasing a `◐`. The inverse also holds: `instant = false` does **not** force a route to be `ƒ`. The glyph reflects what the route does at prerender time, not which validation knobs it exports.

When the subtree passes and the user is happy with each route, **summarize and ask**: open a PR and move to the next subtree, or stop here?

Milestone B is done only when **every** subtree is clean — every remaining `instant = false` sits under a reason comment, no bare TODOs are left (`grep -rln "TODO: Cache Components adoption" app` returns nothing). **Adoption is complete here.** Point the user at [further reading](#further-reading) if they want to push the experience further, or stop and ship.

## further reading

Adoption ends at milestone B. The work below is optional and lives in the docs — link the user to them and let them decide which to take on next. Don't walk these through inside this skill.

- **[Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation)** — dev-only validation warnings the overlay raises on client navigation. Same shape as the blocking-prerender errors you cleared in step 2; the guide covers the per-warning details. Recommend it next if the user wants navigations to actually be instant (a green build doesn't guarantee that — a `<Suspense>` above the shared layout caught the page-load case but doesn't cover client navigation).
- **[Adopting Partial Prefetching](https://nextjs.org/docs/app/guides/adopting-partial-prefetching)** — walks an audit of `<Link prefetch={true}>` calls driven by the dev overlay's `link-prefetch-partial` warning, then flips the `partialPrefetching` config. **Walk the audit first, with the flag off** — flipping it before the audit makes every route count as adopted, so the warnings never fire and the per-link signal is lost. The biggest payoff of Cache Components: `<Link>` prefetches only the static App Shell by default. Recommended after instant navigation, since its fixes feed directly into how much of each route the shell can prefetch.
- **[Prefetching](https://nextjs.org/docs/app/guides/prefetching)** and **[Runtime prefetching](https://nextjs.org/docs/app/guides/runtime-prefetching)** — broader prefetching reference. Runtime prefetching extends the static shell with per-session content; reach for it when a route's shell is too thin to be useful and Partial Prefetching alone doesn't cover the gap.
- **[Locking the result in with e2e tests](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests)** — the `@next/playwright` [`instant()`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/instant#testing-instant-navigation) helper asserts on the UI that's available immediately on navigation, so regressions surface in CI. Recommend it once a route is instant: `next-dev-loop` confirms it _now_; an `instant()` test keeps it that way.
- **[`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer)** — a separate skill that grows each route's static shell so more of the page prerenders and less streams in. Pure optimization, not part of adoption.
