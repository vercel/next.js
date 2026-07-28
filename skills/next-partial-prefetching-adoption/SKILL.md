---
name: next-partial-prefetching-adoption
description: >
  Turn on Partial Prefetching in a Next.js app and work through the
  insights it surfaces. Use when the user wants to enable or adopt
  Partial Prefetching, flip the `partialPrefetching` flag, opt routes
  in with `export const prefetch = 'partial'`, audit
  `<Link prefetch={true}>` calls, or resolve the
  link-prefetch-partial and instant-shell-url-data insights.
---

# next-partial-prefetching-adoption

Enable Partial Prefetching and walk the app until every link reuses a shared App Shell. This skill sequences the work; per-insight recipes live in the dev overlay fix cards and their docs pages. The [Adopting Partial Prefetching guide](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) is the canonical reference for the concepts this skill applies.

The one thing that shapes everything below: **these insights surface only in `next dev`, in the dev overlay's Insights tab.** Nothing fails the build. There is no build-only fallback loop — confirming an insight is _cleared_ means driving the running app in a browser. But a missing browser gates that verification, not the whole skill: the adoption work is static and runs from the guide, so do the static pass anyway and hand off the live shell check.

Talk to the user in terms of what they'll see — PRs, features, and how the app behaves after — never the insight slugs or step labels. Before you start, tell them briefly what Partial Prefetching changes: a `<Link>` loads a shared App Shell, and `prefetch={true}` no longer prefetches everything the old full prefetch did.

## requires

- **Cache Components on (`cacheComponents: true`).** This is the only hard requirement; `partialPrefetching` depends on it. Full Cache Components adoption is the ideal starting point but not a gate. Nothing in this skill blocks the build, and neither do the prerender insights an unadopted route surfaces, like a leftover `unstable_noStore` or a `cookies()` read outside `<Suspense>`: they are non-blocking dev signals, expected on any fresh branch off `main`, not a reason to stop. They replace the URL-data insight only on their own route in the [step 3](#step-3-sweep-for-url-data-insights-after-enabling) sweep; the flag-off step 1 audit and its static adoption run regardless. The only thing that actually stops this skill is a build-blocking failure, and anything build-blocking would have been resolved before you reached here. Otherwise fix the prerender insights you hit as inline [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) work, or hand them off, and keep going.

- **Next.js 16.3 or later.** `partialPrefetching`, the `prefetch` route segment config, and the prefetch insights all land there.

- **A browser you can drive.** Install [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) before starting (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop`). Install it without asking — it's a tool, not a product change — and don't assume it's blocked: verify a real blocker (no network, no npm, read-only filesystem) before falling back, and name it in your report. Link prefetches fire when a link renders and enters the viewport, and shell validation fires on navigation — neither is reachable from `curl` or the build. If the app is webpack-pinned, drive a browser directly (`agent-browser`, Playwright) — you lose the framework cross-checks, not the insights; they're still in the overlay and the dev log.

- **A runnable app.** Verification runs against `next dev` for the insight sweep and a production `next build`/`next start` for prefetching (prefetching is prod-only), so the app has to boot in both. If it reads a database or required env at import (e.g. an `env.ts` that throws on a missing `DATABASE_URL`), confirm it starts — with the real environment, or local data you stand up — before step 1. An app that won't run can't be swept or verified.

### notes

- **Offline docs.** Guide links have offline copies under `node_modules/next/dist/docs/` (bundled since Next.js 16.2), with the directory layout numbered for ordering (e.g. `node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md`). If you can't predict the numbered prefix, `find node_modules/next/dist/docs -name '<slug>.md'` resolves it. The `/docs/messages/*` error pages are not bundled.

- **Older versions without bundled docs.** Suggest `npx @next/codemod@latest agents-md` to the user before starting: it downloads a version-matched copy to `.next-docs/` and writes an index into `AGENTS.md` / `CLAUDE.md`. It touches files in their repo, so ask first and run it only if they want it.

## background

Adopting Partial Prefetching means every route still delivers what its links prefetched before, now split between the App Shell (static and cached content) and the per-link runtime data behind `prefetch = 'allow-runtime'`. The [guide](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) is the canonical reference for what a prefetch contains and how to decide each case; this skill sequences that work against a running app.

The catch that decides most of the sweep: `partial` warms only the shared App Shell, so a route keyed by `params`/`searchParams` needs [`prefetch = 'allow-runtime'`](https://nextjs.org/docs/app/guides/runtime-prefetching) to prefetch its content, not `partial` (the guide's [URL data](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#url-data) section).

## working surfaces

- **The dev server terminal — your primary record.** Each validated route's insights are logged as `Error: Route "...": Next.js encountered ...` lines with the `https://nextjs.org/docs/messages/<slug>` link. Tail the dev log during the sweep; it's the greppable record of what fired where, and it works the same on Turbopack and webpack.
- **The dev overlay Insights tab.** Insights are the amber, non-blocking tab. It appears only once an insight has fired, so a route that surfaces nothing shows no tab at all — that's the clean state, not a missing feature. Don't hunt for the tab on a quiet route; confirm clean from the dev log above, which is the reliable signal. The precondition is no blocking-prerender errors — those replace the insight on their route (see requires). An unrelated Issue (a hydration error, a console error) doesn't block the sweep; don't stall on it. When the tab is present, the overlay pill shows the count and each insight has fix cards linking its docs page. The overlay renders inside a shadow root (`nextjs-portal`), so accessibility-tree snapshots don't see it — evaluate into `shadowRoot` when you need to read or click it programmatically.
- **`next-dev-loop`** to drive navigations and read the overlay. Prefer it over hand-rolled browser automation for the same reasons as in the Cache Components skill (webpack apps: see requires). When browsing its `/_next/mcp` tools, the prefetch insights surface through `get_errors` and the overlay, not the similarly-named `get_request_insights`. That one is the span and performance recorder (gated behind `experimental.requestInsights`) and reports nothing about prefetching.

Every insight has a docs page — open it. Fetch the linked page for every distinct insight you encounter; the inline message is a summary, the page is the recipe.

## step 1: audit `<Link prefetch={true}>` (before enabling)

If `partialPrefetching: true` is already set in `next.config.ts`, the app is adopted — skip to [step 3](#step-3-sweep-for-url-data-insights-after-enabling). Otherwise work the audit with the global flag **off**, adopting each destination with `export const prefetch = 'partial'` — enabling the flag first would mark every route adopted and silence the [`link-prefetch-partial`](https://nextjs.org/docs/messages/instant-link-prefetch-partial) insight this audit runs on. Ask the user how to ship it, in the language of PRs:

- **One branch** — the whole audit in one change, with the flag enabled and the codemod run at the end (step 2).
- **Route by route** — each adopted destination ships as its own PR. The insight still fires for the destinations you haven't reached, a live worklist, and step 2 comes after the last one.

The work is identical either way — only the commit boundaries differ. Default by app size: one branch for a handful of links, route by route when the audit is big enough that reviewers need smaller diffs. Note the choice in your report.

Enumerate the links across the whole source tree, not only `app/` — they often live in `src/components` or shared UI packages: `grep -rnE '\bprefetch\b' --include='*.tsx' --include='*.jsx' .`. Keep the `prefetch={true}` and bare-prop matches (a bare prop is `true`) as the over-prefetching links this audit adopts destinations for, and drop `prefetch={false}` and other values. The same grep also surfaces imperative prefetching: a `router.prefetch(href, { kind: 'full' })` call (often behind a custom hook) is the imperative equivalent of `prefetch={true}`. Audit each such call site's destination the same way you would a link, and verify its prefetch payload in a production build ([step 4](#step-4-verify)) — the flag can change what an imperative `kind: 'full'` prefetch returns, and no insight covers it. If nothing matches, check for a custom link wrapper before calling the audit empty. If there's still nothing, say so in your report and move on to [step 2](#step-2-enable-the-flag).

Then, for each one:

1. **Click it** in `next dev`. The insight fires at navigation time, not when the link prefetches, so a link sitting in the viewport won't trip it — you have to navigate through it. This click is _verification_: it confirms the insight fires before you adopt and clears after. Without a browser, skip the click and adopt from [`link-prefetch-partial`](https://nextjs.org/docs/messages/instant-link-prefetch-partial) and the audit table below — the destination's structure tells you the row, and type-check gates the edit — then leave the live confirmation for the hand-off.
2. **Adopt the destination.** Add `export const prefetch = 'partial'`. That clears the insight for every link pointing at it. If the route reads URL data (`params`, `searchParams`), `partial` warms only its skeleton (the guide's [URL data](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#url-data) section), so it's an `allow-runtime` candidate for step 5, not a finished adoption. Keep `prefetch={true}` on its links and mark the route:

   ```tsx
   // TODO(runtime-prefetch): assess with the user (prefetch = 'allow-runtime')
   export const prefetch = 'partial'
   ```

   Use that exact prefix so step 5 can grep them back. Don't cache or decide anything for these routes now.

3. **Preserve what that prefetch delivered.** The guide's [audit table](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#auditing-link-prefetchtrue-calls) is the canonical decision — fetch it and apply the matching row rather than re-deriving it. Caching uncached content is the judgment call in that table: trace where the data comes from and what freshness and revalidation it needs, per the [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache) docs, and ask the user when the answer isn't clear-cut. The URL-data routes you marked in the previous item wait for step 5.

> **If you add `use cache`, verify under `next start`, not only the build.** A `cookies()`/`headers()`/session read anywhere in the cached call tree throws at request time while `next build` passes clean. See [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache).

## step 2: enable the flag

Once every audited destination has `prefetch = 'partial'`, finish in two moves.

1. **Enable the flag globally.** Set `partialPrefetching: true` in `next.config.ts` (alongside `cacheComponents: true`). Every route is adopted now, so every link is good.
2. **Strip the redundant `prefetch = 'partial'` exports.** Run the first-party `remove-partial-prefetch` codemod rather than a text find-and-replace. It removes only `export const prefetch = 'partial'` and leaves any other value (a deliberate `prefetch = 'allow-runtime'`) in place, along with your `TODO(runtime-prefetch)` markers, which wait for step 5.

   Use the `@canary` channel, not `@latest`. The `remove-partial-prefetch` transform isn't in the stable `@next/codemod` release yet, and `@next/codemod@latest` errors with `Invalid transform choice`.

   ```bash
   npx @next/codemod@canary remove-partial-prefetch ./app
   ```

   The codemod refuses to run on a dirty working tree. Commit or stash unrelated work first, or pass `--force` to let its edits land alongside your WIP. If the codemod isn't available (older `@next/codemod`, sandboxed environment, offline run), reproduce it by hand by removing `export const prefetch = 'partial'` from every `app/**/{page,layout}.{js,jsx,ts,tsx}` — leave any other `prefetch` value in place, and leave the `TODO(runtime-prefetch)` markers where they are. Don't hand-edit when the codemod can run.

## step 3: sweep for URL-data insights (after enabling)

This is a dev-only second pass. The shell check runs only with the flag on, fires at navigation time, and never blocks the build, so it can happen any time after step 2. Build the route queue from a concrete source (the last `next build` route table, or the `app/` tree) and keep it as a todo list.

Sweep feature by feature. A feature is a single product surface — `app/settings/**`, `app/posts/[slug]/**` — not a whole top-level area. Finish one end-to-end before starting the next: load its routes in `next dev` and resolve their insights. The insight never blocks the build and each route is independent, so a partial sweep leaves a working app, and each feature is a self-contained change the user can review or ship on its own.

If the environment can't finish the whole sweep (slow first compiles, a dev server that falls over under load, no browser at all), take the browser-free work as far as it goes before handing off. Adopt every route you can statically: apply the fix from [`URL data`](https://nextjs.org/docs/messages/instant-shell-url-data) (up to a new `<Suspense>` boundary) and opt the route into `prefetch = 'partial'`, gating on type-check. Work the whole queue in one pass — a larger refactor isn't a reason to defer, and asking whether to continue to the next route or tier isn't a checkpoint; keep going. Stop only for a genuine judgment call, and batch those into the single hand-off report: the routes you statically adopted, the ones still needing a live shell check, and the queue.

Watch the Insights tab and the dev log for `Next.js encountered … data` lines. The signal this step adds is [`URL data`](https://nextjs.org/docs/messages/instant-shell-url-data): a `params` or `searchParams` read outside `<Suspense>` ties the shared shell to one URL. It can surface even inside an existing `<Suspense>` when the boundary sits above the read. Open its docs page and follow the fix there.

Loading a route with the flag on prerenders its App Shell, which validates more of the route than the Cache Components build did. So a route that built cleanly under Cache Components (every route `◐`, no errors) can still surface a `blocking-prerender-*` error here the first time its shell is prerendered — [`runtime data`](https://nextjs.org/docs/messages/blocking-prerender-runtime) (`cookies()`/`headers()`), [`uncached data`](https://nextjs.org/docs/messages/blocking-prerender-dynamic) (an uncached `fetch`/DB call), or sync IO like `Date.now()`/`new Date()`. This doesn't mean the Cache Components adoption was incomplete; it's new validation reaching a path the build never exercised. These aren't Partial Prefetching insights — fix each one the same way you would any blocking-prerender error.

These fixes rarely involve the user — each insight names the offending read and its docs page has the fix, so apply it and keep sweeping. Collect the rare exceptions for one batched question at the end: a page that is entirely one URL-dependent region (wrapping it all leaves an empty shell), or a route that should arguably stay opted out. Don't narrate the refactor with comments — the `<Suspense>` boundaries speak for themselves.

## step 4: verify

Checklist before checking in with the user:

- **An empty sweep is the expected outcome when Cache Components adoption finished cleanly** — the prereq already forced every `params`/`searchParams`/`cookies()` read behind `<Suspense>` (surfaced there as `blocking-prerender-*` errors), so a quiet log is success, not a missing signal. Any entry still in the Insights tab is a deliberate, documented decision. To confirm the signal can still fire, check `partialPrefetching` is on, the version is 16.3 or later, and the dev server was restarted after the config change — or move one URL read back outside `<Suspense>`, watch validation fire, then revert. Expect the probe to surface the Cache Components `blocking-prerender-runtime` error rather than the URL-data insight (the upstream check catches the read first) — either one proves the pipeline is alive.
- The App Shells are real: for each route you changed, confirm the first paint after a navigation shows the intended shared content, not an empty shell or a stuck fallback. A `<Suspense>` around the whole page body passes validation with an empty shell, which defeats the point.
- The insights validate shell _structure_, not that a prefetch actually happened. Confirm on the production run (prefetching is prod-only) that navigating a changed link lands on the shared shell instantly.
- **If the app prefetches imperatively** (`router.prefetch(href, { kind: 'full' })`), the insight sweep does not cover it, so an empty sweep is not proof the prefetch survived the flag. On the production run, confirm the prefetch payload for a changed link still carries the route's data, not only the App Shell — compare its `_rsc` prefetch response against a full render of the same route (`PerformanceResourceTiming.decodedBodySize`, or diff the RSC payloads). A shell-only payload means the flag changed what `kind: 'full'` returns; restore the data with `use cache` so it rides the App Shell, or `prefetch = 'allow-runtime'` ([step 5](#step-5-runtime-prefetching-optional)).
- **Before blaming a broken route on the flag, reproduce it with `partialPrefetching` off** (or on the pre-flag branch). The flag surfaces existing issues — a fragile request-time auth gate, a rewrite, deployment skew — earlier and more visibly, but rarely causes them. If it breaks flag-off too, it isn't a Partial Prefetching problem; fix it there, not here.
- `next build` still passes.

Then check in with the user. Speak their language — no insight slugs or step labels.

- What you did: which links you audited, which destinations you adopted, and what each link now prefetches.
- What changed: dropped props, `use cache` boundaries added, and which routes carry a `TODO(runtime-prefetch)` marker for later.
- Demo against a production run. Prefetching is limited in development, so `next dev` won't show the result — run `next build` and `next start`, and hand the user that URL. That run needs the app's real environment (database, auth, secrets), and a partial or stale install or leftover generated artifacts can fail the build for reasons unrelated to the adoption. Set the expectation up front that verification is a complete, credentialed production run, not a quick check.
- Show, don't tell: drive one link live in the headed browser against the production server, so they see the shared App Shell paint instantly and the URL-specific region stream in. Attach before/after screenshots only when a live browser isn't possible.
- Give them the click-through: a table of each changed route — the link to click, and what to expect after the click (what paints instantly, what streams in) — so they can verify each result themselves.
- The question: "Want to commit this (or open the PR) before we look at which routes should also prefetch their URL-specific content?" Wait for the answer — adoption and runtime prefetching read best as their own changes.

## step 5: runtime prefetching (optional)

The audit marked the candidates instead of deciding them. Grep for `TODO(runtime-prefetch)` and walk the list with the user in one conversation. The question per route is whether they want the URL-dependent content prefetched ahead of the click, or streaming in after navigation is fine. A runtime prefetch costs a server invocation per prefetchable link — the guide's [per-link prefetching trade-offs](https://nextjs.org/docs/app/guides/runtime-prefetching#per-link-prefetching-trade-offs) section is the checklist. Don't make these calls alone.

Where the answer is yes, follow the [runtime prefetching guide](https://nextjs.org/docs/app/guides/runtime-prefetching) — add `export const prefetch = 'allow-runtime'` to the route (the codemod in step 2 already stripped the `'partial'` export) and cache the content behind the read using the guide's patterns (`use cache` with the runtime value passed in, or `use cache: private` for per-user data). Each per-link prefetch is a server render, so the [runtime prefetching guide](https://nextjs.org/docs/app/guides/runtime-prefetching#per-link-prefetching-trade-offs) covers the trade-offs, including when to bound it to hover instead of the viewport. Where it's no, delete the marker and leave the route on the default. Either way no `TODO(runtime-prefetch)` marker survives this step. Confirm the opted-in routes against a production run (`next build` and `next start` — the runtime prefetch fires there, not in `next dev`), give the user the same click-through for them, and keep this as its own commit or PR.

## further reading

- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation) — the broader validation model and loading-state tooling.
- [Prevent regressions with e2e tests](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) — the `@next/playwright` `instant()` helper locks in what a navigation shows immediately; recommend it once the sweep is clean, since nothing else guards these in CI.
- [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer) — grows each route's static shell so the App Shell carries more.
