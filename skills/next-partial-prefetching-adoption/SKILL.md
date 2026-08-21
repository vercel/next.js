---
name: next-partial-prefetching-adoption
description: >
  Turn on Partial Prefetching in a Next.js app and work through the
  insights it surfaces. Use when the user wants to enable or adopt
  Partial Prefetching, flip the `partialPrefetching` flag, opt routes
  in with `export const prefetch = 'partial'`, audit
  `Link prefetch={true}` behavior, preserve existing prefetched UI
  with `instant()` tests, or resolve the
  instant-link-prefetch-partial and instant-shell-url-data insights.
---

# next-partial-prefetching-adoption

Enable Partial Prefetching and walk the app until every link reuses a shared App Shell. This skill sequences the work; per-insight recipes live in the dev overlay fix cards and their docs pages. The [Adopting Partial Prefetching guide](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) is the canonical reference for the concepts this skill applies.

The one thing that shapes everything below: **these insights surface only in `next dev`, in the dev overlay's Insights tab.** Nothing fails the build. There is no build-only fallback loop — confirming an insight is _cleared_ means driving the running app in a browser. But a missing browser gates that verification, not the whole skill: the adoption work is static and runs from the guide, so do the static pass anyway and hand off the live shell check.

Talk to the user in terms of what they'll see — PRs, features, and how the app behaves after — never the insight slugs or step labels. Before you start, tell them briefly what Partial Prefetching changes: a `<Link>` loads a shared App Shell, and `prefetch={true}` no longer prefetches everything the old full prefetch did.

## requires

- **Cache Components on (`cacheComponents: true`).** This is the only hard requirement; `partialPrefetching` depends on it. Full Cache Components adoption is the ideal starting point but not a gate. Nothing in this skill blocks the build, and neither do the prerender insights an unadopted route surfaces, like a leftover `unstable_noStore` or a `cookies()` read outside `<Suspense>`: they are non-blocking dev signals, expected on any fresh branch off `main`, not a reason to stop. They replace the URL-data insight only on their own route in the [step 3](#step-3-sweep-for-url-data-insights-after-enabling) sweep; the flag-off step 1 audit and its static adoption run regardless. The only thing that actually stops this skill is a build-blocking failure, and anything build-blocking would have been resolved before you reached here. Otherwise fix the prerender insights you hit as inline [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) work, or hand them off, and keep going.

- **Next.js 16.3 or later.** `partialPrefetching`, the `prefetch` route segment config, and the prefetch insights all land there.

- **A browser you can drive.** Install [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) before starting, unless it is already available — it ships alongside this skill (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop`). Install it without asking — it's a tool, not a product change — and don't assume it's blocked: verify a real blocker (no network, no npm, read-only filesystem) before falling back, and name it in your report. Link prefetches fire when a link renders and enters the viewport, and shell validation fires on navigation — neither is reachable from `curl` or the build. If the app is webpack-pinned, drive a browser directly (`agent-browser`, Playwright) — you lose the framework cross-checks, not the insights; they're still in the overlay and the dev log.

- **A runnable app.** Verification runs against `next dev` for the insight sweep and a production `next build`/`next start` for prefetching (prefetching is prod-only), so the app has to boot in both. If it reads a database or required env at import (e.g. an `env.ts` that throws on a missing `DATABASE_URL`), confirm it starts — with the real environment, or local data you stand up — before step 1. An app that won't run can't be swept or verified.

### notes

- **Offline docs.** Guide links have offline copies under `node_modules/next/dist/docs/` (bundled since Next.js 16.2), with the directory layout numbered for ordering (e.g. `node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md`). If you can't predict the numbered prefix, `find node_modules/next/dist/docs -name '<slug>.md'` resolves it. The `/docs/messages/*` error pages are not bundled.

- **Older versions without bundled docs.** Suggest `npx @next/codemod@latest agents-md` to the user before starting: it downloads a version-matched copy to `.next-docs/` and writes an index into `AGENTS.md` / `CLAUDE.md`. It touches files in their repo, so ask first and run it only if they want it.

## background

Adopting Partial Prefetching means every route preserves the prefetched UI that matters, now split between the shared App Shell and any extra per-link data a link explicitly asks for. The [guide](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) is the canonical reference for what a prefetch contains and how to decide each case; this skill sequences that work against a running app.

The catch that decides most of the sweep: a default link warms only the shared App Shell. A route keyed by `params` or `searchParams` can prefetch more only after it has adopted Partial Prefetching and a specific link uses [`<Link prefetch={true}>`](https://nextjs.org/docs/app/api-reference/components/link#prefetch); then Next.js resolves the URL data and any cached content behind it before the click (the guide's [URL data](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#url-data) section).

## working surfaces

- **The dev server terminal — your primary record.** Each validated route's insights are logged as `Error: Route "...": Next.js encountered ...` lines with the `https://nextjs.org/docs/messages/<slug>` link. Tail the dev log during the sweep; it's the greppable record of what fired where, and it works the same on Turbopack and webpack.
- **The dev overlay Insights tab.** Insights are the amber, non-blocking tab. It appears only once an insight has fired, so a route that surfaces nothing shows no tab at all — that's the clean state, not a missing feature. Don't hunt for the tab on a quiet route; confirm clean from the dev log above, which is the reliable signal. The precondition is no blocking-prerender errors — those replace the insight on their route (see requires). An unrelated Issue (a hydration error, a console error) doesn't block the sweep; don't stall on it. When the tab is present, the overlay pill shows the count and each insight has fix cards linking its docs page. The overlay renders inside a shadow root (`nextjs-portal`), so accessibility-tree snapshots don't see it — evaluate into `shadowRoot` when you need to read or click it programmatically.
- **`next-dev-loop`** to drive navigations and read the overlay. Prefer it over hand-rolled browser automation for the same reasons as in the Cache Components skill (webpack apps: see requires). When browsing its `/_next/mcp` tools, the prefetch insights surface through `get_errors` and the overlay, not the similarly-named `get_request_insights`. That one is the span and performance recorder (gated behind `experimental.requestInsights`) and reports nothing about prefetching.

Every insight has a docs page — open it. Fetch the linked page for every distinct insight you encounter; the inline message is a summary, the page is the recipe.

## step 1: audit `<Link prefetch={true}>` navigations (before enabling)

Keep the global flag **off** while building the baseline suite, then adopt each destination with `export const prefetch = 'partial'`. Enabling the flag first would remove the legacy baseline and silence the [`instant-link-prefetch-partial`](https://nextjs.org/docs/messages/instant-link-prefetch-partial) insight this audit runs on. If the flag is already on in unshipped work, use the pre-flag commit for the baseline. Ask the user how to ship it, in the language of PRs:

- **One branch** — the whole audit in one change, with the flag enabled and the codemod run at the end (step 2).
- **Route by route** — each adopted destination ships as its own PR. The insight still fires for the destinations you haven't reached, a live worklist, and step 2 comes after the last one.

The work is identical either way — only the commit boundaries differ. Default by app size: one branch for a handful of links, route by route when the audit is big enough that reviewers need smaller diffs. Note the choice in your report.

Enumerate explicit prefetch and manual prefetch sites across the whole source tree, not only `app/` — they often live in `src/components` or shared UI packages: `rg -n '\bprefetch\b|router\.prefetch' -g '*.tsx' -g '*.jsx' .`. Trace imports, wrappers, conditional props, and consumers. Include every audited navigation whose effective production Link value is `prefetch={true}`: explicit `true`, a bare `prefetch` prop, and expressions that resolve to `true`. Exclude the default value, `prefetch="auto"`, and `prefetch={false}` from the preservation suite because they do not request the legacy full prefetch. Audit existing [`router.prefetch()`](https://nextjs.org/docs/app/api-reference/functions/use-router#userouter) calls separately because they have no Link insight. For new manual prefetching, follow the [Prefetching guide](https://nextjs.org/docs/app/guides/prefetching#manual-prefetch). If no Link resolves to `prefetch={true}`, say so and move on to [step 2](#step-2-enable-the-flag).

### Choose what to preserve and how to verify it

An explicit `prefetch={true}` proves that someone chose the strongest legacy prefetch, not that every part of the completed page was intentional. Before writing tests or editing destinations, inspect each audited navigation and turn the audit into a decision queue. Keep a local server running and give the user one clickable table:

| Link to try | Destination | Legacy prefetched UI | Proposed target | Content that can stream | Decision |
| ----------- | ----------- | -------------------- | --------------- | ----------------------- | -------- |

Link the source page at the current localhost origin so the user can click the real audited Link; preserve query strings and name the Link when a source page has more than one. Derive the proposal from the Link's purpose, the first viewport, and the destination code. Prefer the smallest coherent target that makes the navigation feel complete: usually the primary heading and content the Link promises. Let secondary panels, below-the-fold content, replies, and freshness-sensitive data stream unless the Link specifically promises them. Propose the full meaningful baseline only when the page is small and coherent or the product intent clearly requires it.

The decision for each row is one of: preserve the full meaningful baseline, preserve a named focused part, or use only the App Shell and remove the explicit full prefetch. Treat every unresolved Decision cell as a todo and walk the table with the user in one conversation, grouping equivalent rows when useful. Explain that preserving more dynamic UI can require more caching and refactoring, while leaving it dynamic preserves request-time freshness. If the user is unavailable or can't judge the pages, use your proposed focused target and record the assumption in the table. Do not treat incidental metadata, invisible markup, or background work as target UI.

After the target UI is settled, offer the verification choice in product terms:

> I recommend adding `instant()` tests before the migration. They prove that the part of the legacy full prefetch you chose to keep remains available after the prefetch changes and stay as regression coverage. This takes longer now because the tests need a reliable production build and test environment. I can instead document the target UI carefully, adopt it now, and add the tests later. Which do you prefer?

If the user asks you to decide or is unavailable, default to **test-first preservation**. If they choose the manual path, keep the table as the before/target inventory, use it with the guide's preservation patterns, and leave the `instant()` cases as an explicit follow-up. Manual does not mean “ignore the target.”

For the test-first path, attempt to use `instant()` rather than assuming the app cannot support it. Reuse existing `@next/playwright` tests and production scripts when present; otherwise verify the aligned dependency, exposed testing API, required environment and auth, then run a focused production smoke. Follow the guide's [preservation-test workflow](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#preserve-existing-prefetched-ui): assert only the selected subset already present in the legacy full prefetch, use positive assertions, and do not assert that unselected legacy UI is absent. Make the complete flag-off suite green before adoption. Treat new prefetched UI as step 5 work; verify any deliberate removal separately after adoption.

If a reliable production run is still unavailable after a concrete setup attempt, name the blocker and ask one follow-up: pause to repair or hand off the test rig (recommended), or proceed from the documented manual target and add tests later. Never silently downgrade from test-first. With no answer, preserve first: do not enable the global flag; finish and hand off the audit, target UI, and runner blocker.

This workflow is specific to a clicked `<Link>`. A direct call such as `router.prefetch('/dashboard')` is a manual prefetch, not a Link prefetch; keep it in the source audit and verify it separately in step 4.

Then:

1. **Lock the chosen target.** For test-first preservation, confirm every test passes against the legacy full prefetch and keep the complete observed baseline in the audit table. A successful build or completed navigation is not a substitute for the passing `instant()` suite. For manual preservation, finish the before/target inventory before editing any destination.
2. **Verify the audit in `next dev`.** Click every audited Link. The insight fires at navigation time, not when the link prefetches, and only for the Link shapes it covers. Audit manual `router.prefetch()` calls from source and verify them separately in production ([step 4](#step-4-verify)).
3. **Adopt every audited destination.** Add the temporary route config with a link to the migration guide:

   ```tsx
   // See: https://nextjs.org/docs/app/guides/adopting-partial-prefetching
   export const prefetch = 'partial'
   ```

   Follow the guide's [preservation patterns](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#auditing-link-prefetchtrue-calls) for any caching and Link-prop changes. If other URL-specific UI might be worth prefetching but was not part of the legacy contract, keep `prefetch={true}` on its links and mark the route for step 5:

   ```tsx
   // TODO(per-link-prefetch): assess with the user whether URL data should resolve before click.
   // See: https://nextjs.org/docs/app/guides/optimizing-prefetching
   export const prefetch = 'partial'
   ```

   Use that exact prefix so step 5 can grep them back. Do not select new target UI now; restore only the target chosen from the legacy behavior.

4. **Restore the target.** For test-first preservation, rerun the unchanged tests and treat failures as the work queue until every test passes. For manual preservation, compare the adopted production navigation with the selected target and document anything not yet restored. Apply the guide's matching preservation pattern, and ask the user before making an unclear freshness or caching decision. New URL-data candidates marked in the previous item wait for step 5.

> **If you add `use cache`, verify under `next start`, not only the build.** A `cookies()`/`headers()`/session read anywhere in the cached call tree throws at request time while `next build` passes clean. See [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache).

## step 2: enable the flag

Once every audited destination has `prefetch = 'partial'`, finish in two moves.

1. **Enable the flag globally.** Set `partialPrefetching: true` in `next.config.ts` (alongside `cacheComponents: true`). Every route is adopted now, so every link is good.
2. **Strip the redundant `prefetch = 'partial'` exports.** Run the first-party `remove-partial-prefetch` codemod rather than a text find-and-replace. It removes only `export const prefetch = 'partial'` and its generated Partial Prefetching guide comment. It leaves other values such as `prefetch = 'force-disabled'` in place, along with your `TODO(per-link-prefetch)` markers and their Optimizing prefetching guide links, which wait for step 5.

   ```bash
   npx @next/codemod@latest remove-partial-prefetch ./app
   ```

   The codemod refuses to run on a dirty working tree. Commit or stash unrelated work first, or pass `--force` to let its edits land alongside your WIP. If the codemod isn't available (older `@next/codemod`, sandboxed environment, offline run), reproduce it by hand by removing `export const prefetch = 'partial'` and its generated Partial Prefetching guide comment from every `app/**/{page,layout}.{js,jsx,ts,tsx}` — leave other `prefetch` values in place, and leave the `TODO(per-link-prefetch)` markers and Optimizing prefetching guide links where they are. Don't hand-edit when the codemod can run.

After the flag and codemod land together, rerun the locked preservation suite when using the test-first path. Otherwise repeat the documented production comparisons under the final global configuration.

## step 3: sweep for URL-data insights (after enabling)

This is a dev-only second pass. The shell check runs only with the flag on, fires at navigation time, and never blocks the build, so it can happen any time after step 2. Build the route queue from a concrete source (the last `next build` route table, or the `app/` tree) and keep it as a todo list.

Sweep feature by feature. A feature is a single product surface — `app/settings/**`, `app/posts/[slug]/**` — not a whole top-level area. Finish one end-to-end before starting the next: load its routes in `next dev` and resolve their insights. The insight never blocks the build and each route is independent, so a partial sweep leaves a working app, and each feature is a self-contained change the user can review or ship on its own.

If the environment can't finish the whole sweep (slow first compiles, a dev server that falls over under load, no browser at all), take the browser-free work as far as it goes before handing off. Adopt every route you can statically: apply the fix from [`URL data`](https://nextjs.org/docs/messages/instant-shell-url-data) (up to a new `<Suspense>` boundary) and opt the route into `prefetch = 'partial'`, gating on type-check. Work the whole queue in one pass — a larger refactor isn't a reason to defer, and asking whether to continue to the next route or tier isn't a checkpoint; keep going. Stop only for a genuine judgment call, and batch those into the single hand-off report: the routes you statically adopted, the ones still needing a live shell check, and the queue.

Watch the Insights tab and the dev log for `Next.js encountered … data` lines. The signal this step adds is [`URL data`](https://nextjs.org/docs/messages/instant-shell-url-data): a `params` or `searchParams` read too high in the suspended subtree ties the shared shell to one URL. This insight is narrow; it most reliably appears on a `generateStaticParams` route where `params` is already under `<Suspense>`, but still awaited before the URL-specific leaf boundary. If a `blocking-prerender-*` error fires instead, apply the same structural fix.

Loading a route with the flag on prerenders its App Shell, which validates more of the route than the Cache Components build did. So a route that built cleanly under Cache Components (every route `◐`, no errors) can still surface a `blocking-prerender-*` error here the first time its shell is prerendered — [`runtime data`](https://nextjs.org/docs/messages/blocking-prerender-runtime) (`cookies()`/`headers()`), [`uncached data`](https://nextjs.org/docs/messages/blocking-prerender-dynamic) (an uncached `fetch`/DB call), or sync IO like `Date.now()`/`new Date()`. This doesn't mean the Cache Components adoption was incomplete; it's new validation reaching a path the build never exercised. These aren't Partial Prefetching insights — fix each one the same way you would any blocking-prerender error.

These fixes rarely involve the user — each insight names the offending read and its docs page has the fix, so apply it and keep sweeping. Collect the rare exceptions for one batched question at the end: a page that is entirely one URL-dependent region (wrapping it all leaves an empty shell), or a route that should arguably stay opted out. Don't narrate the refactor with comments — the `<Suspense>` boundaries speak for themselves.

## step 4: verify

Checklist before checking in with the user:

- **An empty sweep is expected when Cache Components adoption finished cleanly.** A quiet log is success, not a missing signal. If you deliberately probe the validation path, use a `generateStaticParams` route with `params` read inside `<Suspense>` but before the URL-specific leaf boundary; other shapes may surface `blocking-prerender-*` instead.
- The App Shells are real: for each route you changed, confirm the first paint after a navigation shows the intended shared content, not an empty shell or a stuck fallback. A `<Suspense>` around the whole page body passes validation with an empty shell, which defeats the point.
- The insights validate shell _structure_, not that a prefetch actually happened. Confirm on the production run (prefetching is prod-only) that navigating a changed link lands on the shared shell instantly.
- For test-first preservation, every locked `instant()` test for an audited `<Link prefetch={true}>` passes against the production run. For manual preservation, the before/after inventory and any deferred test follow-ups are recorded.
- **If the app prefetches imperatively**, the insight sweep does not cover it, so an empty sweep is not proof the prefetch survived the flag. Verify the call under `next start`: compare the `_rsc` prefetch response or resource timing before/after, and make sure any intentionally preserved full prefetch still carries the data the old call was warming. If it now returns only the App Shell, migrate that call site using the same decision as the nearest `<Link prefetch={true}>` destination — cache the data, or move per-link-prefetch behavior to a docs-supported `<Link prefetch={true}>`.
- **Before blaming a broken route on the flag, reproduce it with `partialPrefetching` off** (or on the pre-flag branch). The flag surfaces existing issues — a fragile request-time auth gate, a rewrite, deployment skew — earlier and more visibly, but rarely causes them. If it breaks flag-off too, it isn't a Partial Prefetching problem; fix it there, not here.
- `next build` still passes.

Then check in with the user. Speak their language — no insight slugs or step labels.

- What you did: which links you audited, which destinations you adopted, and what each link now prefetches.
- What changed: dropped props, `use cache` boundaries added, and which routes carry a `TODO(per-link-prefetch)` marker for later.
- Demo against a production run. Prefetching is limited in development, so `next dev` won't show the result — run `next build` and `next start`, and hand the user that URL. That run needs the app's real environment (database, auth, secrets), and a partial or stale install or leftover generated artifacts can fail the build for reasons unrelated to the adoption. Set the expectation up front that verification is a complete, credentialed production run, not a quick check.
- Show, don't tell: drive one link live in the headed browser against the production server, so they see the shared App Shell paint instantly and the URL-specific region stream in. Attach before/after screenshots only when a live browser isn't possible.
- Give them the click-through: a table of each changed route — the link to click, and what to expect after the click (what paints instantly, what streams in) — so they can verify each result themselves.
- The question: "Want to commit this (or open the PR) before we look at which routes should also prefetch their URL-specific content?" Wait for the answer — adoption and per-link prefetching read best as their own changes.

## step 5: per-link prefetching (optional)

The audit marked candidates beyond the already-preserved legacy contract instead of deciding them. Grep for `TODO(per-link-prefetch)` and walk the list with the user in one conversation. The question per route is whether they want the additional URL-dependent content prefetched ahead of the click, or streaming in after navigation is fine. A per-link prefetch costs a server invocation per prefetchable link — the guide's [trade-offs](https://nextjs.org/docs/app/guides/optimizing-prefetching#trade-offs) section is the checklist. Don't make these calls alone.

Where the answer is yes, follow the [Optimizing prefetching guide](https://nextjs.org/docs/app/guides/optimizing-prefetching): keep [`<Link prefetch={true}>`](https://nextjs.org/docs/app/api-reference/components/link#prefetch) on the links that should resolve more than the App Shell, and cache the content behind the URL-data read using the guide's patterns (`use cache` with the runtime value passed in, or `use cache: private` for per-user data). Each per-link prefetch is a server render when the destination needs non-static data, so use the guide's [per-link trade-offs](https://nextjs.org/docs/app/guides/optimizing-prefetching#trade-offs) to decide when viewport prefetching is worth it and when [hover-triggered prefetch](https://nextjs.org/docs/app/guides/prefetching#hover-triggered-prefetch) is a better fit. Where it's no, delete the marker and leave the route on the App Shell default. Either way no `TODO(per-link-prefetch)` marker survives this step. Confirm the opted-in links against a production run (`next build` and `next start` — the per-link prefetch runs there, not in `next dev`), give the user the same click-through for them, and keep this as its own commit or PR.

## further reading

- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation) — the broader validation model and loading-state tooling.
- [Prevent regressions with e2e tests](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) — use the `@next/playwright` `instant()` helper to build the flag-off baseline suite, then keep it as the CI regression guard.
- [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer) — grows each route's static shell so the App Shell carries more.
