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

The development insights and the preservation tests are two different paths. Insights surface only in `next dev`, in the dev overlay's Insights tab. Test-backed preservation runs against a production-like build with `instant()` and does not need a development server. After the flag is enabled, the separate URL-data insight sweep still uses `next dev`.

## preservation gate

When using test-backed preservation, the first implementation milestone is a passing flag-off `instant()` suite. Set up the production test rig, write the selected assertions, run them with `partialPrefetching` disabled, and record the command and exit status. Test-only configuration required by the rig is allowed, but until that baseline passes, do not enable `partialPrefetching` or edit the destination, cache boundaries, or Link props. Installing missing test dependencies is part of reaching the baseline, not a reason to adopt first. Use the manual path only when `rig-template.md` identifies a concrete blocker the repository cannot resolve, and record the blocker and deferred test coverage.

Talk to the user in terms of what they'll see — PRs, features, and how the app behaves after — never the insight slugs or step labels. Before you start, tell them briefly what Partial Prefetching changes: links to a route prefetch one shared App Shell, and `prefetch={true}` can also resolve cached URL-specific content. The audit determines which UI from the legacy full prefetch to preserve.

## requires

- **Cache Components adopted (`cacheComponents: true`) with a passing build.** Both `partialPrefetching` and the route-level `prefetch` export require Cache Components. If it is off, use [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) first and return after its build-blocking prerender errors are resolved. Those errors can fail `next build`; only the Partial Prefetching insights handled by this skill are non-blocking development signals.

- **Next.js 16.3 or later.** `partialPrefetching`, the `prefetch` route segment config, and the prefetch insights all land there.

- **A browser you can drive.** Test-backed preservation uses an existing or minimal production-mode Playwright suite; manual preservation and the final demonstration use the running production app. The development insight path and the post-flag URL-data sweep use [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop); install it before either development pass unless it is already available (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop`). If the app is webpack-pinned, drive a browser directly (`agent-browser`, Playwright) — you lose the framework cross-checks, not the insights; they're still in the overlay and the dev log.

- **A runnable app.** Preservation and the final demonstration need a production-like build because automatic prefetching runs only in production. The development server is required only when using the insight path or running the post-flag URL-data sweep; do not start it merely to confirm a test-backed preservation case. If the app reads a database or required environment at import, confirm the environment used by the chosen path can start before step 1.

### notes

- **Offline docs.** Guide links have offline copies under `node_modules/next/dist/docs/` (bundled since Next.js 16.2), with the directory layout numbered for ordering (e.g. `node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md`). If you can't predict the numbered prefix, `find node_modules/next/dist/docs -name '<slug>.md'` resolves it. The `/docs/messages/*` error pages are not bundled.

- **Older versions without bundled docs.** Suggest `npx @next/codemod@latest agents-md` to the user before starting: it downloads a version-matched copy to `.next-docs/` and writes an index into `AGENTS.md` / `CLAUDE.md`. It touches files in their repo, so ask first and run it only if they want it.

## background

Adopting Partial Prefetching means every route preserves the prefetched UI that matters, now split between the shared App Shell and any extra per-link data a link explicitly asks for. The [guide](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) is the canonical reference for what a prefetch contains and how to decide each case; this skill sequences that work against a running app.

The catch that decides most of the sweep: a default link warms only the shared App Shell. A route keyed by `params` or `searchParams` can prefetch more only after it has adopted Partial Prefetching and a specific link uses [`<Link prefetch={true}>`](https://nextjs.org/docs/app/api-reference/components/link#prefetch); then Next.js resolves the URL data and any cached content behind it before the click (the guide's [URL data](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#url-data) section).

## working surfaces

- **The production-mode `instant()` suite — the primary record for test-backed preservation.** Reuse the app's production build, test context, and Playwright setup. Read an existing `instant-nav.rig.md` first; if the project has no rig, create it from **`rig-template.md`**. The same tests define the legacy target before adoption and become the work queue after each destination opts into Partial Prefetching. Development can help investigate a failure, but only this suite decides whether the prefetched UI was preserved.
- **The dev server terminal — the primary record for the insight path.** Each validated route's insights are logged as `Error: Route "...": Next.js encountered ...` lines with the `https://nextjs.org/docs/messages/<slug>` link. Tail the dev log during the sweep; it's the greppable record of what fired where, and it works the same on Turbopack and webpack.
- **The dev overlay Insights tab.** Insights are the amber, non-blocking tab. It appears only once an insight has fired, so a route that surfaces nothing shows no tab at all — that's the clean state, not a missing feature. Don't hunt for the tab on a quiet route; confirm clean from the dev log above, which is the reliable signal. The precondition is no blocking-prerender errors — those replace the insight on their route (see requires). An unrelated Issue (a hydration error, a console error) doesn't block the sweep; don't stall on it. When the tab is present, the overlay pill shows the count and each insight has fix cards linking its docs page. The overlay renders inside a shadow root (`nextjs-portal`), so accessibility-tree snapshots don't see it — evaluate into `shadowRoot` when you need to read or click it programmatically.
- **`next-dev-loop`** to drive navigations and read the overlay. Prefer it over hand-rolled browser automation for the same reasons as in the Cache Components skill (webpack apps: see requires). When browsing its `/_next/mcp` tools, the prefetch insights surface through `get_errors` and the overlay, not the similarly-named `get_request_insights`. That one is the span and performance recorder (gated behind `experimental.requestInsights`) and reports nothing about prefetching.

Every insight has a docs page — open it. Fetch the linked page for every distinct insight you encounter; the inline message is a summary, the page is the recipe.

## step 1: audit `<Link prefetch={true}>` navigations (before enabling)

Keep the global flag **off** through this audit and the legacy baseline in step 2. Enabling it earlier would remove the legacy behavior the migration needs to measure. If the flag is already on in unshipped work, use the pre-flag commit for the audit and baseline. When the user is available, ask how to ship it in the language of PRs:

- **One branch** — the whole audit in one change, with the flag enabled and the codemod run at the end (step 4).
- **Route by route** — each adopted destination ships as its own PR. The insight still fires for the destinations you haven't reached, a live worklist, and step 4 comes after the last one.

The work and its order are identical either way — only the commit boundaries differ. When no user is available, default by app size: one branch for a handful of links, route by route when the audit is big enough that reviewers need smaller diffs. Note the choice in your report.

Enumerate explicit prefetch and manual prefetch sites across the whole source tree, not only `app/` — they often live in `src/components` or shared UI packages. Start from `next/link` imports and re-exports, then follow custom wrappers to their consumers. Use `rg -n '\bprefetch\b|router\.prefetch' -g '*.tsx' -g '*.jsx' .` as a candidate list, not as the complete audit; inspect conditional props and forwarded `LinkProps` to determine the effective production value. Include every audited navigation whose effective production Link value is `prefetch={true}`: explicit `true`, a bare `prefetch` prop, and expressions that resolve to `true`. Exclude the default value, `prefetch="auto"`, and `prefetch={false}` from the preservation suite because they do not request the legacy full prefetch. Audit existing [`router.prefetch()`](https://nextjs.org/docs/app/api-reference/functions/use-router#userouter) calls separately because they have no Link insight. For new manual prefetching, follow the [Prefetching guide](https://nextjs.org/docs/app/guides/prefetching#manual-prefetch). If no Link resolves to `prefetch={true}`, say so and move on to [step 4](#step-4-enable-the-flag).

### Choose what to preserve and how to verify it

Before writing tests or editing destinations, follow the guide's [migration guidance](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#migrate-existing-full-prefetches) to propose the UI worth preserving. Present the result in one concise table:

| Navigation | Proposed result |
| ---------- | --------------- |

Group equivalent navigations. Summarize what will be ready immediately and what will stream. When a proposal is ambiguous, show the navigation in the running app and ask the user to confirm it. If they are unavailable, follow the guide and record the assumption.

After the target UI is settled, inspect the existing test setup. The `instant()` helper comes from the separate [`@next/playwright`](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) package, not `next/experimental/testmode/playwright`.

- **Applicable production-mode suite:** use test-backed preservation by default. Reuse the project's `@next/playwright` tests, production scripts, authentication, and existing `instant-nav.rig.md`. Follow the guide's [prefetched UI test workflow](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#verify-prefetched-ui-with-tests) and make the complete flag-off suite green before adoption. The unchanged assertions drive the migration and stay as regression coverage.
- **No applicable production-mode suite:** set up the production-mode rig in **`rig-template.md`** using the project's package manager and test conventions. This is part of test-backed adoption and does not require a user to be present.
- **Rig cannot run reliably:** work through **`rig-template.md`** setup and liveness checks. Fall back to manual preservation only for a concrete blocker the repository cannot resolve, such as unavailable credentials or an inaccessible production environment. Record the blocker and the deferred test coverage; do not claim test-backed verification.

No user input is required to reuse an existing suite or create the rig. Ask only when the repository cannot answer an environment question or when the target UI itself is a product decision. If no user is available, use the guide's safe product default and reserve manual verification for a concrete rig blocker. Treat new prefetched UI as step 7 work; verify any deliberate removal separately after adoption.

This workflow is specific to a clicked `<Link>`. A direct call such as `router.prefetch('/dashboard')` is a manual prefetch, not a Link prefetch; keep it in the source audit and verify it separately in step 6.

## step 2: capture the legacy baseline

Do not enable `partialPrefetching` or edit route behavior, Link props, or cache boundaries during this step. Test-only configuration required to run `instant()` is allowed.

For test-backed preservation, complete the [preservation gate](#preservation-gate): write the complete `instant()` suite and **run it** against the production-like rig with Partial Prefetching disabled. A test file, build, completed navigation, or command printed for the user is not a baseline. Do not continue to step 3 until the suite has actually passed.

For manual preservation, finish the before/target inventory before editing any destination. Fall back to this path only for a concrete rig blocker identified through `rig-template.md`, and record the blocker and deferred tests.

## step 3: adopt destinations and restore the target

Adopt every audited destination with the temporary route config. The route export is enough for the unchanged tests to exercise Partial Prefetching on that destination while the global flag remains off:

```tsx
// See: https://nextjs.org/docs/app/guides/adopting-partial-prefetching
export const prefetch = 'partial'
```

If other URL-specific UI might be worth prefetching but was not part of the legacy contract, keep `prefetch={true}` on its links and mark the route for step 7:

```tsx
// TODO(per-link-prefetch): assess with the user whether URL data should resolve before click.
// See: https://nextjs.org/docs/app/guides/optimizing-prefetching
export const prefetch = 'partial'
```

Use that exact prefix so step 7 can grep them back. Do not select new target UI now; restore only the target chosen from the legacy behavior.

For test-backed preservation, rerun the affected **unchanged** tests after each destination changes and treat failures as the work queue. Run the complete suite and record its passing exit status before enabling the global flag. For manual preservation, compare the adopted production navigation with the selected target and document anything not yet restored. Apply the guide's matching preservation pattern for caching and Link-prop changes, and ask the user before making an unclear freshness or caching decision. New URL-data candidates marked above wait for step 7.

When restoring the target changes caching or invalidation, follow the project's existing verification approach. Reuse or extend an applicable suite for the affected lifecycle, such as freshness after mutations, cache scope, or generated values. If the project doesn't test this type of behavior, do not introduce new test infrastructure during adoption; verify it manually in production and record the expected and observed results. A green `instant()` test proves readiness, not cache correctness. Ask the user only when the intended behavior is unclear.

> **If you add `use cache`, verify under `next start`, not only the build.** A `cookies()`/`headers()`/session read anywhere in the cached call tree throws at request time while `next build` passes clean. See [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache).

## step 4: enable the flag

Once every audited destination has `prefetch = 'partial'`, finish in two moves.

1. **Enable the flag globally.** Set `partialPrefetching: true` in `next.config.ts` (alongside `cacheComponents: true`). Every route is adopted now, so every link is good.
2. **Strip the redundant `prefetch = 'partial'` exports.** Run the first-party `remove-partial-prefetch` codemod rather than a text find-and-replace. It removes every `export const prefetch = 'partial'`, including exports below a `TODO(per-link-prefetch)` marker, and removes its generated Partial Prefetching guide comment. The TODO marker and its Optimizing prefetching guide link stay for step 7. Other values such as `prefetch = 'force-disabled'` stay in place.

   ```bash
   npx @next/codemod@canary remove-partial-prefetch ./app
   ```

   Use `./src/app` in a `src/` project and check the reported file count. The codemod refuses to run on a dirty working tree. Commit or stash unrelated work first, or pass `--force` to let its edits land alongside your WIP. If the codemod isn't available (older `@next/codemod`, sandboxed environment, offline run), reproduce it by hand by removing `export const prefetch = 'partial'` and its generated Partial Prefetching guide comment from every `app/**/{page,layout}.{js,jsx,ts,tsx}` — leave other `prefetch` values in place, and leave the `TODO(per-link-prefetch)` markers and Optimizing prefetching guide links where they are. Don't hand-edit when the codemod can run.

After the flag and codemod land together, rerun the locked preservation suite when using the test-backed path. Otherwise repeat the documented production comparisons under the final global configuration.

## step 5: sweep for URL-data insights (after enabling)

This is a dev-only second pass. The shell check runs only with the flag on, fires at navigation time, and never blocks the build, so it can happen any time after step 4. Build the route queue from a concrete source (the last `next build` route table, or the `app/` tree) and keep it as a todo list.

Sweep feature by feature. A feature is a single product surface — `app/settings/**`, `app/posts/[slug]/**` — not a whole top-level area. Finish one end-to-end before starting the next: load its routes in `next dev` and resolve their insights. The insight never blocks the build and each route is independent, so a partial sweep leaves a working app, and each feature is a self-contained change the user can review or ship on its own.

If the environment can't finish the whole sweep (slow first compiles, a dev server that falls over under load, no browser at all), take the browser-free work as far as it goes before handing off. Adopt every route you can statically: apply the fix from [`URL data`](https://nextjs.org/docs/messages/instant-shell-url-data) up to a new `<Suspense>` boundary, gating on type-check. Work the whole queue in one pass — a larger refactor isn't a reason to defer, and asking whether to continue to the next route or tier isn't a checkpoint; keep going. Stop only for a genuine judgment call, and batch those into the single hand-off report: the routes you statically adopted, the ones still needing a live shell check, and the queue.

Watch the Insights tab and the dev log for `Next.js encountered … data` lines. The signal this step adds is [`URL data`](https://nextjs.org/docs/messages/instant-shell-url-data): a `params` or `searchParams` read too high in the suspended subtree ties the shared shell to one URL. This insight is narrow; it most reliably appears on a `generateStaticParams` route where `params` is already under `<Suspense>`, but still awaited before the URL-specific leaf boundary. If a `blocking-prerender-*` error fires instead, apply the same structural fix.

Loading a route with the flag on prerenders its App Shell, which validates more of the route than the Cache Components build did. So a route that built cleanly under Cache Components (every route `◐`, no errors) can still surface a `blocking-prerender-*` error here the first time its shell is prerendered — [`runtime data`](https://nextjs.org/docs/messages/blocking-prerender-runtime) (`cookies()`/`headers()`), [`uncached data`](https://nextjs.org/docs/messages/blocking-prerender-dynamic) (an uncached `fetch`/DB call), or sync IO like `Date.now()`/`new Date()`. This doesn't mean the Cache Components adoption was incomplete; it's new validation reaching a path the build never exercised. These aren't Partial Prefetching insights — fix each one the same way you would any blocking-prerender error.

These fixes rarely involve the user — each insight names the offending read and its docs page has the fix, so apply it and keep sweeping. Collect the rare exceptions for one batched question at the end: a page that is entirely one URL-dependent region (wrapping it all leaves an empty shell), or a route that should arguably stay opted out. Don't narrate the refactor with comments — the `<Suspense>` boundaries speak for themselves.

## step 6: verify

Checklist before checking in with the user:

- **An empty sweep is expected when Cache Components adoption finished cleanly.** A quiet log is success, not a missing signal. If you deliberately probe the validation path, use a `generateStaticParams` route with `params` read inside `<Suspense>` but before the URL-specific leaf boundary; other shapes may surface `blocking-prerender-*` instead.
- The App Shells are real: for each route you changed, confirm the first paint after a navigation shows the intended shared content, not an empty shell or a stuck fallback. A `<Suspense>` around the whole page body passes validation with an empty shell, which defeats the point.
- The insights validate shell _structure_, not that a prefetch actually happened. Confirm on the production run (automatic prefetching runs only in production) that navigating a changed link lands on the shared shell instantly.
- For test-backed preservation, every locked `instant()` test for an audited `<Link prefetch={true}>` passes against the production run. For manual preservation, the before/after inventory and any deferred test follow-ups are recorded.
- Any caching or invalidation changed to preserve the target is verified through an applicable existing test suite or a recorded manual check when the project has no such coverage.
- **If the app prefetches imperatively**, the insight sweep does not cover it, so an empty sweep is not proof the prefetch survived the flag. Verify the call under `next start`: compare the `_rsc` prefetch response or resource timing before/after, and make sure any intentionally preserved full prefetch still carries the data the old call was warming. If it now returns only the App Shell, migrate that call site using the same decision as the nearest `<Link prefetch={true}>` destination — cache the data, or move per-link-prefetch behavior to a docs-supported `<Link prefetch={true}>`.
- **Before blaming a broken route on the flag, reproduce it with `partialPrefetching` off** (or on the pre-flag branch). The flag surfaces existing issues — a fragile request-time auth gate, a rewrite, deployment skew — earlier and more visibly, but rarely causes them. If it breaks flag-off too, it isn't a Partial Prefetching problem; fix it there, not here.
- `next build` still passes.

Then check in with the user. Speak their language — no insight slugs or step labels.

- What you did: which links you audited, which destinations you adopted, and what each link now prefetches.
- What changed: dropped props, `use cache` boundaries added, and which routes carry a `TODO(per-link-prefetch)` marker for later.
- Demo against a production run. Automatic prefetching runs only in production, so `next dev` won't show the result — run `next build` and `next start`, and hand the user that URL. That run needs the app's real environment (database, auth, secrets), and a partial or stale install or leftover generated artifacts can fail the build for reasons unrelated to the adoption. Set the expectation up front that verification is a complete, credentialed production run, not a quick check.
- Show, don't tell: drive one link live in the headed browser against the production server, so they see the shared App Shell paint instantly and the URL-specific region stream in. Attach before/after screenshots only when a live browser isn't possible.
- Give them the click-through: a table of each changed route — the link to click, and what to expect after the click (what paints instantly, what streams in) — so they can verify each result themselves.
- The question: "Want to commit this (or open the PR) before we look at which routes should also prefetch their URL-specific content?" Wait for the answer — adoption and per-link prefetching read best as their own changes.

## step 7: per-link prefetching (optional)

The audit marked candidates beyond the already-preserved legacy contract instead of deciding them. Grep for `TODO(per-link-prefetch)` and walk the list with the user in one conversation. The question per route is whether they want the additional URL-dependent content prefetched ahead of the click, or streaming in after navigation is fine. A per-link prefetch costs a server invocation per prefetchable link — the guide's [trade-offs](https://nextjs.org/docs/app/guides/optimizing-prefetching#trade-offs) section is the checklist. Don't make these calls alone.

Where the answer is no, delete the marker and leave the route on the App Shell default. Where the answer is yes, follow the [Optimizing prefetching guide](https://nextjs.org/docs/app/guides/optimizing-prefetching), confirm the opted-in link against a production run, and delete the marker when the selected result is verified.

No `TODO(per-link-prefetch)` marker survives the finished step. Per-link optimization remains a separate commit or PR from adoption.

Finally, show any effective `prefetch={false}` links in a concise `Navigation | Why it may no longer be needed` table. Explain that `false` disables all prefetching, while Partial Prefetching's default `auto` behavior prefetches only the shared App Shell, so opt-outs added to avoid legacy full-route prefetching may now be unnecessary. Invite the user to revisit them separately.

## further reading

- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation) — the broader validation model and loading-state tooling.
- [Prevent regressions with e2e tests](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) — use the `@next/playwright` `instant()` helper to build the flag-off baseline suite, then keep it as the CI regression guard.
- [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer) — grows each route's static shell so the App Shell carries more.
