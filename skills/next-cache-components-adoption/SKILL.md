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

Enable Cache Components on an app and walk it to a passing build. This skill sequences the work; per-error recipes live in the dev overlay fix cards and the build's terminal output. The [migrating to Cache Components guide](https://nextjs.org/docs/app/guides/migrating-to-cache-components) is the canonical reference for the concepts and per-API recipes this skill applies — consult it whenever the skill steps reference a pattern (`"use cache"`, `cacheLife`, `<Suspense>` placement, etc.) and you want the full explanation.

## requires

- **App Router project.** Cache Components is an App Router feature; `cacheComponents: true` does nothing for `pages/` routes. If the project has a `pages/` or `src/pages/` tree but no `app/` or `src/app/` tree, stop and tell the user — Pages → App migration is its own project, not part of this skill. A hybrid app (both `pages/` and `app/`) is fine: the flag affects the `app/` routes; `pages/` routes are unaffected and don't need opt-outs.

- **Next.js 16.3 or later.** That release is where the pieces this skill relies on land: top-level `cacheComponents`, `export const instant`, the dev-overlay instant-navigation validation warnings, and the `cache-components-instant-false` codemod. If `next --version` reports below 16.3, upgrade first:
  - `npx @next/codemod@latest upgrade latest` to apply the version-to-version codemods.
  - Read the relevant [version upgrade guide](https://nextjs.org/docs/app/guides/upgrading) (e.g. [Version 16](https://nextjs.org/docs/app/guides/upgrading/version-16)) for what the codemod doesn't cover.

- **No incompatible config keys.** `cacheComponents: true` errors on any file that still exports `dynamic`, `revalidate`, or `fetchCache`, and on `experimental.dynamicIO` (renamed). `experimental.useCache` still works as a deprecated alias but should be migrated for clarity. **Translate, don't delete.** Each export encodes behavior the route needs to keep doing; migrate each one to its Cache Components equivalent via the [migration guide's per-key sections](https://nextjs.org/docs/app/guides/migrating-to-cache-components#enable-cache-components). If a value can't be cleanly translated yet, leave a `// TODO: Cache Components adoption — restore revalidate = 3600` comment so the loop picks it up.

### notes

- **No green baseline before the flag.** If the app already uses `"use cache"`, the pre-flag build errors with `please enable the feature flag cacheComponents`. Enabling the flag is the first thing you do (in Incremental, before the codemod; in Direct, before fixing routes) — not a thing to do _after_ getting green. Note this in your starting summary so it doesn't read as a regression.

- **Offline docs.** Offline copies of guide links live under `node_modules/next/dist/docs/`, with the directory layout numbered for ordering (e.g. `node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md`). The trailing filename matches the slug. If you can't predict the numbered prefix, `find node_modules/next/dist/docs -name '<slug>.md'` resolves it. The `/docs/messages/*` error pages are not bundled. If offline docs are missing entirely, run `npx @next/codemod@latest agents-md` to write a version-matched index into `AGENTS.md` / `CLAUDE.md`.

## the shape of the work

There's one loop: walk the route tree top-down, one feature at a time, adopting each route against `next dev` + a browser. The build is a final check for each feature, not the working surface.

The choice in step 1 is whether to silence the validation errors first or fix them as you go. Either way the loop is the same:

- **With a quiet pre-step (Incremental).** Run the codemod to opt every page and layout out of validation. The build passes immediately, you ship that as its own PR, and then start the loop — removing one opt-out at a time and adopting that route. Picks the work apart into small reviewable PRs.
- **Without (Direct).** Enable `cacheComponents` and start the loop on whatever the build flags first. Same loop, but every fix sits on one branch until adoption is complete.

In both, the per-route success bar is the same: **dev loop reports no errors AND `next build` passes**. Check in with the user after every feature. Expect to spend most of the time in the loop, not in the pre-step.

## background

`cacheComponents: true` requires every route to be prerenderable. A route that reads request-time data outside `<Suspense>` is "blocking" and fails the build. `export const instant = false` marks a route as allowed to block, which clears it in both dev and build; on a layout it covers the whole subtree beneath it. Reads wrapped in a [`"use cache"`](https://nextjs.org/docs/app/api-reference/directives/use-cache) function count as cache boundaries, not blocking reads.

Three classes of blocker bite agents in this order:

1. **Request-time reads** (`cookies()`, `headers()`, `await params`, `await searchParams`). All four block when awaited at the top of a page or layout. `params` and `searchParams` often get missed because they're not framed as "request data" the way cookies and headers are. The fix is to push the read into a `<Suspense>`-wrapped child — and for `params`/`searchParams`, forward the promise into the child and await it there; don't `await` at the page top.
2. **Sync-IO at module/render time** (`new Date()`, `Date.now()`, `Math.random()`, `crypto.randomUUID()`). These fail the build even with `instant = false` — the opt-out doesn't suppress them. If they're in a shared layout, they block every route under it. The codemod can't fix them; you have to translate each one (cache it with `"use cache"` if it's stable, or wrap it in `await connection()` + `<Suspense>` if it's per-request) before the build can pass. Grep the whole repo for these calls before running anything else.
3. **`"use cache"` files that read request data.** A file with a top-level `"use cache"` directive can't export `instant`; combining the two errors with `Only async functions are allowed to be exported in a "use cache" file.` and means the directive was wrong for that route. Remove it before running the codemod.

## working surfaces

### finding blocking routes

Prefer `next dev` over `next build` while you work.

- **`next dev`** — the working surface. Visit a route; its blocking errors surface in the dev overlay with full stack traces and fix cards linking the per-error docs. Work one route at a time — errors don't accumulate in one place. The route itself still returns HTTP 200, so read the overlay (or `.next-dev.log`), not status codes. A cleared overlay is one half of route-clean — the other half is browser verification (see [step 2](#step-2-the-inner-loop-remove-opt-outs-one-feature-at-a-time)) and a passing build for that route.
- **`next build`** — detection only. The build is `next dev`'s authoritative check, not its replacement. Use it as the last gate on each feature in the loop (a passing build is part of the per-route success bar) and as the final verification across the whole app. In Incremental, the build also confirms the pre-step (codemod opted every route out, no shared layout still has a sync-IO blocker) before you ship that PR. Don't reach for the build instead of the dev loop while you're working a route — even when the build surfaces a clean compile error, you still don't know what ended up in the static shell vs streamed; the build's clean error messages are the seductive part. By default the build stops at the first blocking route, so it's also poor for sizing the work. Two flags help when iterating: `--debug-build-paths` builds only the routes you name (comma-separated glob patterns of file paths relative to the project root, e.g. `--debug-build-paths="app/admin/**/page.tsx"` — not URL paths; `--debug-build-paths="app/(marketing)/about/page.tsx"` — not `/about`; `--debug-build-paths="app/admin"` matches nothing and silently builds zero routes), and `--debug-prerender` disables the early exit so the build continues past the first prerender failure, reports every blocking route, and prints a fuller stack trace that names the originating file and line.

Every blocking error has a docs page — open it. Both the dev overlay and the build terminal print a `https://nextjs.org/docs/messages/<slug>` link with each error. That page is the canonical recipe for the fix; the inline message is a summary. Fetch the link for every distinct error you encounter, even if you think you know the pattern — the recipes evolve, and the same error class can have different correct fixes depending on what the route reads. Don't improvise from the inline message alone. (`/docs/messages/*` pages aren't bundled offline; if you have no network, fall back to the per-API guides under `node_modules/next/dist/docs/` and note the limitation when you report back.)

### verifying each fix at runtime

A passing build or a cleared overlay isn't proof the route actually behaves — Cache Components is a runtime concern (a static shell with streamed data). Verify after every fix, not only at the end.

In preference order:

1. **[`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) — strongly preferred.** Cross-checks `/_next/mcp` against the live browser via `agent-browser` and surfaces both compile and runtime issues in one pass. The diagnostics (React tree, suspense boundaries, console + network) are orders of magnitude richer than poking at `next dev` by hand.

   Install it before starting the loop. Don't wait until you hit something `next dev` alone can't explain. Run:

   ```bash
   npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop
   ```

   The skill requires `agent-browser >= 0.27.0` and walks you through it.

   **Requires Turbopack.** If `package.json`'s `dev` script passes `--webpack`, flag it to the user and ask whether there's a reason to stay on webpack. If not, switch to Turbopack (the Next.js 16.3+ default). If they want to keep webpack, skip this install and use the [build-only loop](#the-loop-build-only-fallback) instead.

   You don't need permission to install `next-dev-loop` itself. It's a tool, like installing a dev dependency. If a user is on the line, briefly tell them you're installing it for verification. In a non-interactive run (CI, dashboard, sandbox), install it without asking — "can't prompt the user" is not a reason to skip. The only legitimate skip is a real technical blocker: no network, no npm, read-only filesystem, a stated no-new-deps policy, or a webpack-only dev script. If you skip, name the specific blocker in your final report.

2. **A browser you can drive yourself.** Playwright, `agent-browser` directly, any browser-automation tool. Use only when `next-dev-loop` is genuinely blocked. You'll miss the framework-side checks (`/_next/mcp`), so DOM assertions alone don't catch every regression — be more cautious about what you call "verified."

3. **Build-only.** If you can't run a dev server at all, the build is your only signal. `○ (Static)` routes with no `<Suspense>` are fully verified by the build (nothing streamed to test). `◐ (Partial Prerender)` routes are only shell-verified — flag them when you report back.

4. **No tooling at all.** Ask the user to run the dev server (or build) and report what they see, or commit the milestone you've reached and hand off.

## step 1: choose a strategy

Ask the user. Phrase it as a PR-shape question, not a sizing call. Never use the internal labels (Incremental, Direct, milestone A) when talking to the user — those are your own scaffolding. Ask in terms of PRs and features, e.g.: _"Do you want me to first open a PR that turns on Cache Components and opts every route out of validation, then handle the actual route adoptions feature-by-feature in follow-up PRs? Or do everything on one branch?"_ Even on a tiny app, the incremental path still has value (review-sized PR, revertible, the `// TODO: Cache Components adoption` markers double as your work queue for next session). Don't pick on their behalf.

In a non-interactive run, default to **Incremental** for a multi-route app and **Direct** for a handful-of-routes app, and say so when you start.

- **Incremental** — quiet pre-step + the loop. Run the codemod to opt every page and layout out of validation, get the build passing, stop and check in with the user (see [end of the pre-step](#end-of-the-pre-step-check-in)), then enter [step 2's loop](#step-2-the-inner-loop-remove-opt-outs-one-feature-at-a-time) and ship each feature as a follow-up PR.
- **Direct** — skip the pre-step. Enable `cacheComponents` and go straight to [step 2's loop](#step-2-the-inner-loop-remove-opt-outs-one-feature-at-a-time); the build's blocking routes are the work queue.

### incremental

Before invoking the codemod, fix the sync-IO blockers it can't. Grep the whole repo for `new Date()`, `Date.now()`, `Math.random()`, and `crypto.randomUUID()` (not only `app/**/layout.{js,jsx,ts,tsx}` — the read might live in any component imported by a layout). Translate each match using the recipe from its `blocking-prerender-*` error card: cache stable values with `"use cache"`; wrap per-request values in `await connection()` + `<Suspense>`. A layout with two distinct reads (e.g. a copyright year and a "last updated" stamp) usually needs two distinct fixes.

The codemod refuses to run on a dirty working tree. Commit or stash unrelated work first, or pass `--force` to let its edits land alongside your WIP. Common false positive: if you recently upgraded Next.js, `package.json` and the lockfile will already be dirty — commit those first.

Use the `@canary` channel, not `@latest`. The `cache-components-instant-false` transform isn't in the stable `@next/codemod` release; `@next/codemod@latest` errors with `Invalid transform choice`.

```bash
npx @next/codemod@canary cache-components-instant-false ./app
```

Inserts `export const instant = false` (with a `// TODO: Cache Components adoption` comment) into every `app/**/{page,layout,default}` file, skipping files that already declare `instant` and any module marked `"use client"` or `"use server"`. Then set `cacheComponents: true`. The TODO comments are the work queue for the loop.

If the codemod isn't available (older `@next/codemod`, sandboxed environment, offline run), reproduce it by hand: for every `app/**/{page,layout,default}.{js,jsx,ts,tsx}` that isn't `"use client"` or `"use server"` and doesn't already declare `instant`, insert this after the imports:

```ts
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false
```

The codemod opts every segment out, not only the root, on purpose. Resolution is top-down, first-explicit-config-wins: the highest `instant = false` decides the whole subtree. With an opt-out on every segment, removing one segment's opt-out validates only that segment; descendants keep their own opt-outs and stay green. If only the root were opted out, removing it would re-arm validation for the entire app at once.

Because the highest opt-out wins, remove them top-down (root layout first, then descend). Removing a leaf's opt-out does nothing while an ancestor still holds one.

Confirm the pre-step with `next build`. The build is the proof, not the codemod run — a shared layout that calls `new Date()` / `Math.random()` directly still fails regardless of the opt-out (see [background](#background)).

After the build passes, confirm the root layout got an opt-out (`grep -n "export const instant" app/layout.*`). The root layout renders every route, including framework routes like `/_not-found`, so if it was missed, add `export const instant = false` to it by hand.

Synthetic routes like `/_not-found` have no user file — when they block, fix the root layout's opt-out, not the synthetic route. Client Components (`"use client"`) get no opt-out (it's a build error — `E1344` — to export `instant` from them) and rarely block on their own; when a client route blocks, fix the server-side data in its ancestor layout.

### end of the pre-step: check in

Incremental only. Stop here before starting step 2 — the pre-step is the shippable PR. Talk to the user in their language; don't say "milestone A" or "Incremental"; talk about adoption, PRs, and what the app does now. Tell them:

- What you did: turned on Cache Components, ran the codemod that opts every page and layout out of the new validation (or did it by hand), fixed any blockers the codemod can't (list them), confirmed the build passes.
- What changed: every page and layout in `app/` now exports `instant = false` with a `// TODO: Cache Components adoption` comment, except client components and any that already had an `instant` export.
- What to sanity-check: the diff is mostly mechanical (new exports + comments). The build passes. Routes still behave exactly as they did before — the opt-outs preserve current behavior; no rendering changes yet.
- The question: "Want to open this as its own PR before we start adopting Cache Components route by route? Or keep going on this branch?" Wait for the answer.

Moving to step 2 without checking in defeats the point of taking the incremental path.

### direct

Set `cacheComponents: true` and move to [step 2](#step-2-the-inner-loop-remove-opt-outs-one-feature-at-a-time). The build's blocking routes are the work queue.

## step 2: the inner loop, remove opt-outs one feature at a time

A "feature" is a single product surface — `app/settings/profile/**`, `app/posts/[slug]/**` — not a whole top-level app like `app/dashboard/**`. Finish one end-to-end before starting the next.

Within a feature, walk top-down (layouts before pages, root layout first). Removing a layout's opt-out before its descendants exposes the layout's own blocking reads. (Direct: there are no opt-outs to remove — fix each failing route; if a hand-written opt-out on an ancestor shadows it, remove that first.)

A passing build mid-walk doesn't mean the layout is clean. Removing a layout's opt-out while its descendant pages still have theirs keeps the build passing — each page shadows the inherited validation. The layout's actual blocking reads only surface once nothing below it shadows them. Don't call a feature done at the layout boundary.

Use the **with-a-browser** loop unless a browser is genuinely unreachable. The [`next-dev-loop`](#verifying-each-fix-at-runtime) skill is the source of truth for what counts as "browser available" and how to install it.

### the loop, with a browser (preferred)

Per route:

- Remove the opt-out (Incremental) or target the failing route (Direct).
- Reload in dev. Overlay clean? Skip to verify. Overlay still red? Fix.
- Fix — fetch the docs page linked from the error (`https://nextjs.org/docs/messages/<slug>`), apply the recipe from there. The inline overlay text is a summary; the docs page is the source of truth.
- Verify in the browser. Confirm the visible content on first paint is what you intended in the shell — not stuck on a fallback, not silently streaming everything out of an empty shell.
- Re-check siblings if the fix touched shared code (a layout, a sidebar component). A shared-shell change can fix the route you're on and break a sibling.

### the loop, build-only (fallback)

Used when there's no way to drive a browser — CI, sandbox, the user has no `next dev` running and you can't start one. Weaker signal: confirms the build passes and the route prerenders, but not what ended up in the static shell vs streamed.

Per route:

- Remove the opt-out (Incremental) or target the failing route (Direct).
- Rebuild with `--debug-build-paths app/<route>/**` (only that route) or `--debug-prerender` (full build, but past the first failure). Route green? Move on. Still blocking? Fix.
- Fix — fetch the docs page linked from the error (`https://nextjs.org/docs/messages/<slug>`), apply the recipe from there.
- Re-check siblings if the fix touched shared code.
- Flag the route as build-only-verified when you hand the feature off. Each `◐` route still needs a browser pass before the feature is done.

### loop notes

- The [three blocker classes from background](#background) often get missed when fixing in place. Caching a downstream fetch (`getThing(id)`) doesn't clear an `await params` at the top of the page body — push the param promise into the `<Suspense>`-wrapped child.
- Ambiguous calls are user check-ins, not agent judgment. When you're not sure which fix fits, the blocking code looks security-sensitive, or the user might want to keep the route blocking on purpose — read [references/per-page-decisions.md](./references/per-page-decisions.md) before editing.
- Don't narrate the refactor with comments. The only comment the codemod (or you) should leave is `// TODO: Cache Components adoption` on opt-outs, and the user's existing comments. Don't annotate every `<Suspense>` boundary or `"use cache"` call with what it does — the code says that. Drop a comment only when the _why_ isn't clear from the code (e.g. a deliberate Block with a reason).

Keep a todo list of the feature's routes. When every route in the feature is clean, move to step 3.

## step 3: verify the feature

Checklist before checking in with the user:

- `next build` completes without blocking-route errors.
- No bare `// TODO: Cache Components adoption` opt-outs in the feature (`grep` to confirm). Any `instant = false` left behind is a deliberate, documented Block — comment rewritten to a reason (see [references/per-page-decisions.md](./references/per-page-decisions.md) → "when to leave a Block in place").
- Each route visited in the browser: confirm the static shell renders first and every `<Suspense>` fallback resolves to its real content. Capture both states if you can — the fallback (mid-stream) and the final paint — so you have a streaming-experience demo to show the user. Throttle the network in the browser if streaming is too fast to observe.

Then check in with the user. Same rule as the pre-step: speak their language. Don't say "milestone B" or "feature‑by‑feature loop"; talk about the feature you adopted and what the user will see.

- What you did: which routes you touched, and the user-visible result per route (e.g. "the post page now streams the article body behind a skeleton while the layout stays static").
- What changed: opt-outs removed, fallbacks added, caching boundaries introduced.
- Show, don't tell. If the browser is running, drive the route live for the user so they see the static shell → fallback → final content sequence in real time. If you can't drive a live browser, attach the before/after screenshots you captured instead.
- The question: "Want to open this feature as a PR and move on to the next, or stop here?" Wait for the answer.

**Trivial features can skip the check-in.** If adopting a feature only meant removing its `// TODO: Cache Components adoption` opt-out (no `<Suspense>` added, no `'use cache'` introduced, no render order change), the user sees nothing different. Move on to the next feature without stopping; mention it in passing the next time you do check in.

When the loop has run on every feature — every remaining `instant = false` sits under a reason comment, `grep -rln "TODO: Cache Components adoption" app` returns nothing — point the user at [further reading](#further-reading) if they want to push the experience further, or stop and ship.

### route table glyphs

`ƒ` → `◐` is the adoption landing. `◐ (Partial Prerender)` means a static shell prerenders and the request-time content streams in — the goal state for any route that reads `cookies()`, `headers()`, `params`, or `searchParams`. Some routes legitimately stay `ƒ` when they do request-time work through a documented escape hatch (e.g. a layout that uses `await connection()`); the page is no longer _opted out_, it's genuinely dynamic. Don't rip the escape hatch back out chasing a `◐`. The inverse holds: `instant = false` does not force a route to be `ƒ`. The glyph reflects what the route does at prerender time, not which validation knobs it exports.

`◐` tells you a shell exists, not what's in it. A `<Suspense>` boundary placed too high (e.g. wrapping the entire page body, or `<Suspense fallback={null}>` around the article content) pushes the visible content out of the static shell into the streamed payload; the build still reports `◐` because _some_ shell prerendered (often only `<html><body>` with framework markup). The route table can't tell you what's in the shell; a browser can. If the shell is empty and everything streams, pull the `<Suspense>` boundary down closer to the actual dynamic read.

## further reading

The work below is optional and lives in the docs — link the user to them and let them decide which to take on next. Don't walk these through inside this skill.

- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation) — dev-only validation warnings the overlay raises on client navigation. Same shape as the blocking-prerender errors you cleared in step 2; the guide covers the per-warning details. Recommend it next if the user wants navigations to actually be instant (a passing build doesn't guarantee that — a `<Suspense>` above the shared layout caught the page-load case but doesn't cover client navigation).
- [Adopting Partial Prefetching](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) — walks an audit of `<Link prefetch={true}>` calls driven by the dev overlay's `link-prefetch-partial` warning, then flips the `partialPrefetching` config. Walk the audit first, with the flag off — flipping it before the audit makes every route count as adopted, so the warnings never fire and the per-link signal is lost. The biggest payoff of Cache Components: `<Link>` prefetches only the static App Shell by default. Recommended after instant navigation, since its fixes feed directly into how much of each route the shell can prefetch.
- [Prefetching](https://nextjs.org/docs/app/guides/prefetching) and [Runtime prefetching](https://nextjs.org/docs/app/guides/runtime-prefetching) — broader prefetching reference. Runtime prefetching extends the static shell with per-session content; reach for it when a route's shell is too thin to be useful and Partial Prefetching alone doesn't cover the gap.
- [Locking the result in with e2e tests](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) — the `@next/playwright` [`instant()`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/instant#testing-instant-navigation) helper asserts on the UI that's available immediately on navigation, so regressions surface in CI. Recommend it once a route is instant: `next-dev-loop` confirms it _now_; an `instant()` test keeps it that way.
- [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer) — a separate skill that grows each route's static shell so more of the page prerenders and less streams in. Pure optimization, not part of adoption.
