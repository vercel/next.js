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

The one thing that shapes everything below: **these insights surface only in `next dev`, in the dev overlay's Insights tab.** Nothing fails the build. There is no build-only fallback loop for this skill — the work is a sweep of the running app in the browser. If you can't drive a browser, stop and tell the user what you can't verify, or commit the milestone you've reached and hand off.

Talk to the user in what they'll see — PRs, features, and how the app behaves after — never the insight slugs or step labels. Before you start, tell them briefly what Partial Prefetching changes: a `<Link>` loads a shared App Shell, and `prefetch={true}` no longer prefetches everything the old full prefetch did.

## requires

- **Cache Components already adopted.** `partialPrefetching` only works with `cacheComponents: true`, and the sweep below assumes the app has no blocking-route errors left: a route whose static shell fails validation surfaces the blocking-prerender error _instead of_ the prefetch insight, so unfinished adoption hides exactly the signal this skill works from. Run [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) to completion first — this skill is its follow-up.

- **Next.js 16.3 or later.** `partialPrefetching`, the `prefetch` route segment config, and the prefetch insights all land there.

- **A browser you can drive.** Install [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) before starting (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop`). Link prefetches fire when a link renders and enters the viewport, and shell validation fires on navigation — neither is reachable from `curl` or the build. If the app is webpack-pinned, drive a browser directly (`agent-browser`, Playwright) — you lose the framework cross-checks, not the insights; they're still in the overlay and the dev log.

### notes

- **Offline docs.** Guide links have offline copies under `node_modules/next/dist/docs/` (bundled since Next.js 16.2), with the directory layout numbered for ordering (e.g. `node_modules/next/dist/docs/01-app/02-guides/adopting-partial-prefetching.md`). If you can't predict the numbered prefix, `find node_modules/next/dist/docs -name '<slug>.md'` resolves it. The `/docs/messages/*` error pages are not bundled.

- **Older versions without bundled docs.** Suggest `npx @next/codemod@latest agents-md` to the user before starting: it downloads a version-matched copy to `.next-docs/` and writes an index into `AGENTS.md` / `CLAUDE.md`. It touches files in their repo, so ask first and run it only if they want it.

## background

Adopting Partial Prefetching means every route still delivers what its links prefetched before, now split between the App Shell (static and cached content) and the per-link runtime data behind `prefetch = 'allow-runtime'`. The [guide](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) is the canonical reference for what a prefetch contains and how to decide each case; this skill sequences that work against a running app.

## working surfaces

- **The dev server terminal — your primary record.** Each validated route's insights are logged as `Error: Route "...": Next.js encountered ...` lines with the `https://nextjs.org/docs/messages/<slug>` link. Tail the dev log during the sweep; it's the greppable record of what fired where, and it works the same on Turbopack and webpack.
- **The dev overlay Insights tab.** Insights are the amber, non-blocking tab. It appears only once an insight has fired, so a route that surfaces nothing shows no tab at all — that's the clean state, not a missing feature. Don't hunt for the tab on a quiet route; confirm clean from the dev log above, which is the reliable signal. The precondition is no blocking-prerender errors — those replace the insight on their route (see requires). An unrelated Issue (a hydration error, a console error) doesn't block the sweep; don't stall on it. When the tab is present, the overlay pill shows the count and each insight has fix cards linking its docs page. The overlay renders inside a shadow root (`nextjs-portal`), so accessibility-tree snapshots don't see it — evaluate into `shadowRoot` when you need to read or click it programmatically.
- **`next-dev-loop`** to drive navigations and read the overlay. Prefer it over hand-rolled browser automation for the same reasons as in the Cache Components skill (webpack apps: see requires).

Every insight has a docs page — open it. Fetch the linked page for every distinct insight you encounter; the inline message is a summary, the page is the recipe.

## step 1: audit `<Link prefetch={true}>` (before enabling)

> **New project, or links you wrote yourself?** There's nothing to audit — you already made the keep-or-drop call as you added each link. Enable `partialPrefetching: true` and add `prefetch={true}` per the guide's [new-project note](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#enable-partial-prefetching), then go straight to the [URL-data sweep](#step-3-sweep-for-url-data-insights-after-enabling). The audit below is for adopting an **existing** app: it surfaces legacy `prefetch={true}` calls whose destinations predate Partial Prefetching, which enabling the flag would otherwise mark adopted silently.

Do this with the global flag **off** — enabling it marks every route adopted and stops the [`link-prefetch-partial`](https://nextjs.org/docs/messages/instant-link-prefetch-partial) insight from surfacing, so the audit has to come first.

Enumerate the links across the whole source tree, not only `app/` — they often live in `src/components` or shared UI packages: `grep -rn "prefetch={true}\|prefetch$" --include='*.tsx' --include='*.jsx' .` (catch the bare `prefetch` prop and `next/link` wrappers too). Then, for each one:

1. **Click it** in `next dev`. The insight fires at navigation time, not when the link prefetches, so a link sitting in the viewport won't trip it — you have to navigate through it.
2. **Preserve what that prefetch delivered.** The guide's [audit table](https://nextjs.org/docs/app/guides/adopting-partial-prefetching#auditing-existing-link-prefetchtrue-calls) is the canonical decision — fetch it and apply the matching row rather than re-deriving it. This is where the `use cache` additions happen — uncached content the prefetch delivered gets cached now so it joins the App Shell, subject to the freshness batching below. Content that depends on URL data (`params`, `searchParams`) is the exception and gets a marker in the next item instead.
3. **Adopt the destination.** Add `export const prefetch = 'partial'`, which clears the insight for every link pointing at it. Where a destination's prefetch delivered URL-dependent content (`params`, `searchParams`), also keep `prefetch={true}` and leave a `TODO(runtime-prefetch)` marker above the export, always with that exact prefix so you can grep them back later. Don't decide that now, and don't cache the data behind it yet — you'll assess both with the user in step 5.

   ```tsx
   // TODO(runtime-prefetch): assess with the user (prefetch = 'allow-runtime')
   export const prefetch = 'partial'
   ```

The adoption and prop changes are mechanical — do them without stopping. Caching is the one judgment call, since `use cache` changes freshness. Cache the guide table's clear-cut cases as you go, and collect the freshness-sensitive ones (personalized or real-time content) into one batch for the user at the end of the audit. Skip the check-in if the batch is empty. With no user to ask, flag them instead of deciding. If the grep finds no `<Link prefetch={true}>`, note it and move on.

## step 2: enable the flag

Once every audited destination has `prefetch = 'partial'`, enable it globally.

1. **Enable the flag globally.** Set `partialPrefetching: true` in `next.config.ts` (alongside `cacheComponents: true`). Every route is adopted now, so every link is good.
2. **Strip the redundant `prefetch = 'partial'` exports.** Run the first-party `remove-partial-prefetch` codemod rather than a text find-and-replace. It removes only `export const prefetch = 'partial'` and leaves any other value (a deliberate `prefetch = 'allow-runtime'`) in place, along with your `TODO(runtime-prefetch)` markers, which wait for step 5.

   Use the `@canary` channel, not `@latest`. The `remove-partial-prefetch` transform isn't in the stable `@next/codemod` release yet, and `@next/codemod@latest` errors with `Invalid transform choice`.

   ```bash
   npx @next/codemod@canary remove-partial-prefetch ./app
   ```

   The codemod refuses to run on a dirty working tree. Commit or stash unrelated work first, or pass `--force` to let its edits land alongside your WIP. If the codemod isn't available (older `@next/codemod`, sandboxed environment, offline run), reproduce it by hand by removing `export const prefetch = 'partial'` from every `app/**/{page,layout}.{js,jsx,ts,tsx}` and leaving any other `prefetch` value in place. Don't hand-edit when the codemod can run.

## step 3: sweep for URL-data insights (after enabling)

This is a separate, dev-only pass, and it can wait: the shell check runs only with Partial Prefetching on, fires at navigation time, and never blocks the build, so you can make it any time after enabling. Load every route in `next dev` to collect its shell insights. Build the queue from a concrete source (the last `next build` route table, or the `app/` tree) and keep it as a todo list. It doesn't have to be feature by feature — finish every route.

Watch the Insights tab and the dev log for `Next.js encountered … data` lines. The signal this step adds is [`URL data`](https://nextjs.org/docs/messages/instant-shell-url-data): a `params` or `searchParams` read outside `<Suspense>` ties the shared shell to one URL. It can surface even inside an existing `<Suspense>` when the boundary sits above the read. Open its docs page and follow the fix there.

If Cache Components adoption left gaps, loading routes can also re-surface the blocking-prerender errors from that step — [`runtime data`](https://nextjs.org/docs/messages/blocking-prerender-runtime) (`cookies()`/`headers()`) or [`uncached data`](https://nextjs.org/docs/messages/blocking-prerender-dynamic) (an uncached `fetch`/DB call). Those aren't Partial Prefetching insights; treat them as unfinished Cache Components work and fix them the same way.

These fixes rarely involve the user — each insight names the offending read and its docs page has the fix, so apply it and keep sweeping. Collect the rare exceptions for one batched question at the end: a page that is entirely one URL-dependent region (wrapping it all leaves an empty shell), or a route that should arguably stay opted out. Don't narrate the refactor with comments — the `<Suspense>` boundaries speak for themselves.

## step 4: verify

- Insights tab empty (or every remaining entry is a deliberate, documented decision) and the dev log quiet, after loading every route. **An empty sweep is the expected outcome when Cache Components adoption finished cleanly** — the prereq already forced every `params`/`searchParams`/`cookies()` read behind `<Suspense>` (surfaced there as `blocking-prerender-*` errors), so there's nothing left for this step to flag. That's success, not a missing signal. If nothing surfaced and you want to confirm the signal can still fire, check `partialPrefetching` is on, the version is 16.3 or later, and the dev server was restarted after the config change; or move one URL read back outside `<Suspense>` and watch it fire, then revert.
- The App Shells are real: for each route you changed, confirm the first paint after a navigation shows the intended shared content, not an empty shell or a stuck fallback. A `<Suspense>` around the whole page body passes validation with an empty shell, which defeats the point.
- `next build` still passes.

Then check in, in the user's language, with no insight slugs or step labels. Drive a link live in the headed browser so they see the shared App Shell paint instantly and the URL-specific region stream in — cover which links now share a prefetch, what streams in after navigation, and what stayed opted out and why. Attach before/after screenshots only when a live browser isn't possible.

Adoption is complete here, and runtime prefetching is a separate optimization on top. The question: "Want to commit this (or open the PR) before we look at which routes should also prefetch their URL-dependent content?" Wait for the answer — the two read best as their own changes.

## step 5: runtime prefetching (optional)

The audit marked the candidates instead of deciding them. Grep for `TODO(runtime-prefetch)` and walk the list with the user in one pass: for each route, do they want the URL-dependent content prefetched ahead of the click, or is streaming in after navigation fine? A runtime prefetch costs a server invocation per visible link — the guide's [when to reach for it](https://nextjs.org/docs/app/guides/runtime-prefetching#when-to-reach-for-runtime-prefetching) section is the checklist for this conversation. Don't make the call alone — but make it once, here, not route by route.

Where the answer is yes, follow the [runtime prefetching guide](https://nextjs.org/docs/app/guides/runtime-prefetching) — switch the route to `prefetch = 'allow-runtime'` and cache the content behind the read using the guide's patterns (`use cache` with the runtime value passed in, or `use cache: private` for per-user data). Where it's no, delete the marker and leave the route on the default. Either way no `TODO(runtime-prefetch)` marker survives this step. Confirm the opted-in routes in `next dev`, and keep this as its own commit or PR.

## further reading

- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation) — the broader validation model and loading-state tooling.
- [Prevent regressions with e2e tests](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) — the `@next/playwright` `instant()` helper locks in what a navigation shows immediately; recommend it once the sweep is clean, since nothing else guards these in CI.
- [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer) — grows each route's static shell so the App Shell carries more.
