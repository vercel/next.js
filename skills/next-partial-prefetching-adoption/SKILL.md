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

Enable Partial Prefetching and verify that the app preserves the prefetched UI that matters. This skill sequences the work; the [Adopting Partial Prefetching guide](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) is the source of truth for behavior, migration patterns, and trade-offs. Read the relevant guide section before changing each destination instead of reproducing its recipes here.

The insights surface only in `next dev` and never fail the build. Verify actual prefetching with `next build` and `next start`, because prefetching is limited in development.

Talk to the user in terms of what they'll see — PRs, features, and how the app behaves after — never the insight slugs or step labels. Before you start, tell them briefly what Partial Prefetching changes: a `<Link>` loads a shared App Shell, and `prefetch={true}` no longer prefetches everything the old full prefetch did.

## requires

- **Cache Components on (`cacheComponents: true`).** Partial Prefetching depends on it. Resolve any blocking-prerender work with [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption).

- **Next.js 16.3 or later.** `partialPrefetching`, the `prefetch` route segment config, and the prefetch insights all land there.

- **A browser you can drive.** Use [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) when available. Otherwise use browser automation directly. A build or `curl` cannot trigger the navigation insights.

- **A runnable app.** Confirm the app boots in development and production with the environment and authentication its tested routes require.

### notes

- **Offline docs.** Guide links have offline copies under `node_modules/next/dist/docs/` (bundled since Next.js 16.2), with the directory layout numbered for ordering (e.g. `node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md`). If you can't predict the numbered prefix, `find node_modules/next/dist/docs -name '<slug>.md'` resolves it. The `/docs/messages/*` error pages are not bundled.

- **Older versions without bundled docs.** Suggest `npx @next/codemod@latest agents-md` to the user before starting: it downloads a version-matched copy to `.next-docs/` and writes an index into `AGENTS.md` / `CLAUDE.md`. It touches files in their repo, so ask first and run it only if they want it.

## working surfaces

- **The dev server terminal** is the primary record. Tail it while navigating and keep a route queue from the insight messages.
- **The dev overlay Insights tab** shows the same non-blocking findings and links their fix pages. A route with no insights has no tab; confirm the quiet state from the terminal. The overlay lives in the `nextjs-portal` shadow root when browser automation needs to inspect it.
- **`next-dev-loop`** drives navigations and reads the overlay. Prefetch insights surface through `get_errors`, not `get_request_insights`.

Every insight has a docs page — open it. Fetch the linked page for every distinct insight you encounter; the inline message is a summary, the page is the recipe.

## step 1: audit `<Link prefetch={true}>` navigations (before enabling)

Keep the global flag **off** while building the baseline suite. Enabling it first removes the legacy baseline and silences the [`instant-link-prefetch-partial`](https://nextjs.org/docs/messages/instant-link-prefetch-partial) insight. If the flag is already on in unshipped work, use the pre-flag commit for the baseline.

Ask whether to ship the adoption on one branch or route by route. Use one branch for a small audit and route-sized changes when reviewers need smaller diffs.

Find prefetch sites across the source tree with `rg -n '\bprefetch\b|router\.prefetch' -g '*.tsx' -g '*.jsx' .`, then trace wrappers and conditional props. Use the guide's [`prefetch={true}` audit](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#auditing-link-prefetchtrue-calls) to decide which links are in scope and how each destination should migrate. Audit existing [`router.prefetch()`](https://nextjs.org/docs/app/api-reference/functions/use-router#userouter) calls separately because they have no Link insight. If no link is in scope, move on to [step 2](#step-2-enable-the-flag).

### Choose what to preserve and how to verify it

Before writing tests or editing destinations, follow the guide's [audit guidance](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#auditing-link-prefetchtrue-calls) to propose the UI worth preserving. Present the result in one concise table:

| Navigation | Proposed result |
| ---------- | --------------- |

Group equivalent navigations and summarize what will be ready immediately and what will stream. Show the navigation in the running app when that helps the user decide. If they are unavailable, follow the guide and record the assumption.

After the target UI is settled, offer the verification choice in product terms:

> I recommend adding `instant()` tests now so the selected prefetched UI stays covered after the migration. This needs a working production test environment. Want me to add the tests now, or document the target and add coverage later?

Default to test-first preservation when the user asks you to decide or is unavailable. For the manual path, record the target UI and leave the tests as a follow-up.

For test-first preservation, reuse existing `@next/playwright` tests and production scripts when possible, then follow the guide's [preservation-test workflow](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#preserve-existing-prefetched-ui). If a production test run is unavailable after a concrete setup attempt, report the blocker and ask whether to repair the runner or continue from the documented target. With no answer, stop before enabling the flag.

Then:

1. **Lock the chosen target.** Make the flag-off `instant()` suite pass, or record the expected UI for manual preservation.
2. **Verify the audit in `next dev`.** Click every audited Link. The insight fires at navigation time, not when the link prefetches, and only for the Link shapes it covers. Audit manual `router.prefetch()` calls from source and verify them separately in production ([step 4](#step-4-verify)).
3. **Adopt every audited destination.** Add the temporary route config with a link to the migration guide:

   ```tsx
   // See: https://nextjs.org/docs/app/guides/adopting-partial-prefetching
   export const prefetch = 'partial'
   ```

   Follow the guide's preservation pattern for each destination. Record new optimization ideas separately; adoption restores only the chosen legacy behavior.

4. **Restore the target.** Rerun the unchanged tests or compare the production navigation with the documented target. Use failures as the work queue and ask before making an unclear freshness or caching decision.

> **If you add `use cache`, verify under `next start`, not only the build.** A `cookies()`/`headers()`/session read anywhere in the cached call tree throws at request time while `next build` passes clean. See [`use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache).

## step 2: enable the flag

Once every audited destination has `prefetch = 'partial'`, finish in two moves.

1. **Enable the flag globally.** Set `partialPrefetching: true` in `next.config.ts` (alongside `cacheComponents: true`). Every route is adopted now, so every link is good.
2. **Strip the redundant `prefetch = 'partial'` exports.** Run the first-party codemod with the app directory for the project:

   ```bash
   npx @next/codemod@canary remove-partial-prefetch ./app
   ```

   Use `./src/app` for a `src/` project and check the reported file count. Follow the guide's [incremental adoption section](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#adopting-incrementally) for dirty-tree and fallback handling.

After the flag and codemod land together, rerun the locked preservation suite when using the test-first path. Otherwise repeat the documented production comparisons under the final global configuration.

## step 3: sweep for URL-data insights (after enabling)

Build a route queue from the app tree and sweep one product surface at a time in `next dev`. Follow the guide's [URL-data audit](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#auditing-routes-for-url-data) and the docs page linked from each insight. Confirm the route still paints meaningful shared UI after moving URL data behind `<Suspense>`.

If another blocking-prerender insight appears, use its docs page and the Cache Components adoption skill. Do not let unrelated runtime issues expand this migration. If no browser is available, make only changes supported by the source and mark the affected routes for live verification.

## step 4: verify

Checklist before checking in with the user:

- A quiet dev log after visiting the full route queue.
- The App Shells are real: for each route you changed, confirm the first paint after a navigation shows the intended shared content, not an empty shell or a stuck fallback. A `<Suspense>` around the whole page body passes validation with an empty shell, which defeats the point.
- A production run where each changed navigation reaches the selected prefetched UI.
- Every preservation test passes, or the manual before/after result and deferred coverage are recorded.
- Any audited `router.prefetch()` call is verified separately in production.
- `next build` passes.

Then check in with the user. Speak their language — no insight slugs or step labels.

- What you did: which navigations you audited and what each now prefetches.
- What changed: the Link props, cache boundaries, and route structure that changed.
- Show the production navigation live when possible; otherwise attach the clearest before/after evidence.
- The question: "Want to commit this (or open the PR) before we look at which routes should also prefetch their URL-specific content?" Wait for the answer — adoption and per-link prefetching read best as their own changes.

## further reading

- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation) — the broader validation model and loading-state tooling.
- [Prevent regressions with e2e tests](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) — use the `@next/playwright` `instant()` helper to build the flag-off baseline suite, then keep it as the CI regression guard.
- [Optimizing prefetching](https://nextjs.org/docs/app/guides/optimizing-prefetching) — consider new URL-specific content only after adoption; keep that work in a separate change.
- [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer) — grows each route's static shell so the App Shell carries more.
