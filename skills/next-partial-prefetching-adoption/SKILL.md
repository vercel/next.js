---
name: next-partial-prefetching-adoption
description: >
  Turn on Partial Prefetching in a Next.js app and work through the
  insights it surfaces. Use when the user wants to enable or adopt
  Partial Prefetching, flip the `partialPrefetching` flag, opt routes
  in with `export const prefetch = 'partial'`, audit
  `<Link prefetch={true}>` calls, or resolve the
  link-prefetch-partial and URL-data-during-prefetching insights.
---

# next-partial-prefetching-adoption

Enable Partial Prefetching and walk the app until every link reuses a shared prefetch. This skill sequences the work; per-insight recipes live in the dev overlay fix cards and their docs pages. The [Adopting Partial Prefetching guide](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) is the canonical reference for the concepts this skill applies.

The one thing that shapes everything below: **these insights surface only in `next dev`, at navigation time, in the dev overlay's Insights tab.** Nothing fails the build. There is no build-only fallback loop for this skill — the work is a click-through sweep of the running app. If you can't drive a browser, stop and tell the user what you can't verify.

## requires

- **Cache Components already adopted.** `partialPrefetching` only works with `cacheComponents: true`, and the sweep below assumes the app has no blocking-route errors left: a route whose static shell fails validation surfaces the blocking-prerender error _instead of_ the prefetch insight, so unfinished adoption hides exactly the signal this skill works from. Run [`next-cache-components-adoption`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-adoption) to completion first — this skill is its follow-up.

- **Next.js 16.3 or later.** `partialPrefetching`, the `prefetch` route segment config, and the prefetch insights all land there.

- **A browser you can drive.** Install [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) before starting (`npx skills add https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop`). Link prefetches fire when a link renders and enters the viewport, and shell validation fires on navigation — neither is reachable from `curl` or the build. If the app is webpack-pinned, drive a browser directly (`agent-browser`, Playwright) — you lose the framework cross-checks, not the insights; they're still in the overlay and the dev log.

## background

Partial Prefetching changes what `<Link>` downloads for a route. By default a link loads the route's App Shell — one shared shell per route, reused by every link to it regardless of params. `<Link prefetch={true}>` adds the cached page content, and stops prefetching dynamic data entirely.

Two insights drive the work, and they fire on different pages:

1. **[`instant-link-prefetch-partial`](https://nextjs.org/docs/messages/instant-link-prefetch-partial)** fires on the page that _renders_ a `<Link prefetch={true}>` whose target hasn't adopted Partial Prefetching. It's the audit signal for step 1. It fires when the link actually prefetches, so the page holding the link must be visited with the link in the viewport.

2. **[`instant-shell-link-data`](https://nextjs.org/docs/messages/instant-shell-link-data)** ("URL data outside of Suspense while extracting a reusable shell") fires on the _target_ route when its shared prefetch reads `params` or `searchParams` outside `<Suspense>` — that ties the prefetch to a single URL, so links can't share it. It fires when the route is validated: on initial load and on navigation to it.

What counts as URL data: only `params` and `searchParams`. `cookies()` and `headers()` vary per user, not per link, so they don't affect prefetch sharing. `generateStaticParams` doesn't help — a statically-known param still belongs to one URL. A read inside `generateMetadata` surfaces as its own variant ([URL data in `generateMetadata()`](https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime)); a read inside `generateViewport` surfaces as the runtime-viewport prerender error instead, since viewport can't stream out of the shell.

## working surfaces

- **The dev server terminal — your primary record.** Each validated route's insights are logged as `Error: Route "...": Next.js encountered ...` lines with the `https://nextjs.org/docs/messages/<slug>` link. Tail the dev log during the sweep; it's the greppable record of what fired where, and it works the same on Turbopack and webpack.
- **The dev overlay Insights tab.** Insights are the amber, non-blocking tab. The precondition is no blocking-prerender errors — those replace the insight on their route (see requires). An unrelated Issue (a hydration error, a console error) doesn't block the sweep; don't stall on it. The overlay pill shows the count; each insight has fix cards linking its docs page. The overlay renders inside a shadow root (`nextjs-portal`), so accessibility-tree snapshots don't see it — evaluate into `shadowRoot` when you need to read or click it programmatically.
- **`next-dev-loop`** to drive navigations and read the overlay. Prefer it over hand-rolled browser automation for the same reasons as in the Cache Components skill (webpack apps: see requires).

Every insight has a docs page — open it. Fetch the linked page for every distinct insight you encounter; the inline message is a summary, the page is the recipe.

## step 1: audit `<Link prefetch={true}>` with the flag off

Do this **before** enabling anything. Enabling the global flag first marks every route as adopted, which stops the `link-prefetch-partial` warning from firing, and the per-link signal is lost (the guide calls this out).

1. Enumerate the links across the whole source tree, not just `app/` — links often live in `src/components` or shared UI packages: `grep -rn "prefetch={true}\|prefetch$" --include='*.tsx' --include='*.jsx' .` (also catch the bare `prefetch` prop). Watch for wrapper components that forward props to `next/link` — a `prefetch={true}` on a custom `<Link>` wrapper counts.
2. Visit each page that renders one, with the link scrolled into view, and collect the insights from the overlay and the dev log.
3. Decide per link using the guide's table:
   - Target fully static → drop `prefetch={true}`; the default already loads the whole page.
   - Target has cached content worth shipping early → keep it.
   - Target needs request data on arrival → keep it, and consider `export const prefetch = 'allow-runtime'` on the target ([runtime prefetching](https://nextjs.org/docs/app/guides/runtime-prefetching)). `'allow-runtime'` is an enhancement, not a way to clear the warning — the adoption opt-in is `'partial'`.

If the grep finds nothing, note it and go straight to [step 2](#step-2-enable-and-sweep-the-routes) — there's no audit to discuss.

Check in with the user with the list of links and your per-link recommendation before editing. These are product decisions (what's worth prefetching), not mechanical fixes — and they're visual decisions, so show the pages while you ask. The `next-dev-loop` session runs the browser headed, so the user can watch: for each link you're asking about, drive to the page that renders it, then click through to the target, so they see what would ship ahead of the navigation and what wouldn't. Fall back to screenshots per link only when a headed browser isn't possible, and say so.

## step 2: enable and sweep the routes

Two shapes, same loop:

- **Whole app**: set `partialPrefetching: true` in `next.config.ts` (alongside `cacheComponents: true`).
- **Incremental**: add `export const prefetch = 'partial'` to one route's page at a time; links to that route load the App Shell even without the global flag. Once every route in scope is opted in, flip the flag and delete the per-route exports.

Then sweep. The work queue is every route reachable by a link — build it from a concrete source (the route table from the last `next build`, or the `app/` tree) and keep it as a todo list, so the sweep is reproducible instead of improvised:

- Visit each route directly (initial-load validation) **and** navigate to it through its links (navigation validation). Both paths validate; navigating is what users actually do, so don't skip it.
- Watch the Insights tab and the dev log for `while extracting a reusable shell`.
- A route that redirects never validates — mark it unswept, not clean.
- The first visit per route pays a compile in dev (long on webpack, or with heavy pages). Warm the route before judging it, and don't mistake a cold compile for a hang.
- Per insight, apply the fix from its docs page. The shape is always the same: keep the URL-independent part of the route outside the boundary, pass the `params`/`searchParams` promise into a `<Suspense>`-wrapped child, and await it only there. Don't await above the boundary.
- For the `generateMetadata` variant: switch to a static `metadata` export, or accept the metadata blocking and mark the route dynamic per its fix cards.
- `export const instant = false` opts a route out of all instant-navigation validation. That's a deliberate, documented decision (the route genuinely can't share a prefetch), not a way to clear the list — same rule as the Cache Components skill.

Re-check pages that render links to a route you changed: fixing a target route can surface the next insight on the page linking to it.

## step 3: verify

- Silence is only success if the signal can fire. If nothing surfaced anywhere (overlay or dev log) across the whole sweep, verify the setup before reporting all clean: the flag is on, the version is 16.3 or later, and the dev server was restarted after the config change.
- Insights tab empty (or every remaining entry is a documented `instant = false` decision) after sweeping every route both ways.
- The shells are real: for each route you touched, confirm in the browser that the first paint after a navigation shows the intended shared content, not an empty shell or a stuck fallback. A `<Suspense>` around the whole page body passes validation with an empty shell, which defeats the point.
- `next build` still passes (it should never have broken — this skill's changes are Suspense placement and config).

Check in with the user per feature, in their language: which links now share a prefetch, what streams in after navigation, what stayed opted out and why. Show, don't tell — click the link in the headed browser while they watch, so they see the shared shell paint instantly and the URL-specific region stream in. Throttle the network in the browser if it's too fast to observe. Attach before/after screenshots only when a live browser isn't possible.

## further reading

- [Adopting Partial Prefetching](https://nextjs.org/docs/app/guides/adopting-partial-prefetching) — the canonical guide this skill sequences, including the route-side URL data audit.
- [Instant navigation](https://nextjs.org/docs/app/guides/instant-navigation) — the broader validation model and loading-state tooling.
- [Prevent regressions with e2e tests](https://nextjs.org/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) — the `@next/playwright` `instant()` helper locks in what a navigation shows immediately; recommend it once the sweep is clean, since nothing else guards these in CI.
- [`next-cache-components-optimizer`](https://github.com/vercel/next.js/tree/canary/skills/next-cache-components-optimizer) — grows each route's static shell so the shared prefetch carries more.
