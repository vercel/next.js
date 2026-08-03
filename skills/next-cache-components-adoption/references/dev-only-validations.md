# dev-only validation sweep

How to surface and fix the instant-navigation insights that a clean `next build` does not show. The [Instant navigation guide](https://nextjs.org/docs/app/guides/instant-navigation) is the canonical reference for the validation model this exercises.

## what the build misses

By default (`validationLevel: 'warning'`) Cache Components validates every Page and Default segment in `next dev`, and the insights land in the dev overlay's Insights tab, not the build. Validation runs on every page load using the real request, and for each route it independently checks the initial page load and client navigations at different points in the hierarchy. So a `<Suspense>` boundary that covers the page load can still leave a client navigation blocking, and a layout stays clean at build time while a descendant keeps its `instant = false`. The build stops at the first blocking route and does not raise this family by default. Loading each route in dev is what surfaces it.

## when to run it

After the Cache Components build is clean, not before. While the app is mid-adoption the build redboxes mask this, so a full clean build (every route `◐`, no errors) is the precondition. A quiet sweep is the expected result of a clean adoption, not a missing signal.

## the loop

Reuse the [`next-dev-loop`](https://github.com/vercel/next.js/tree/canary/skills/next-dev-loop) preflight (Turbopack), then add one job. On a webpack app, drive a browser directly with `agent-browser` or Playwright instead. You lose the `/_next/mcp` cross-checks, not the insights, which still show in the overlay and the dev log.

1. Build a route queue from the last build's route table or the `app/` tree.
2. Load each route in `next dev` with a browser. A refresh or a link click both work, and validation simulates both the page-load and client-navigation cases on that load, so you do not need to click through every link by hand. Dynamic params are checked against the real values you visit, so hit a concrete `[slug]`, not the pattern.
3. Watch the dev log and the Insights tab. The dev log is the greppable record, one `Error: Route "...": Next.js encountered ...` line per insight with its `docs/messages/<slug>` link, and it reads the same on Turbopack and webpack. The Insights tab is amber and appears only once an insight fires, so a route with no tab is clean. Through `next-dev-loop`'s `/_next/mcp`, these come from `get_errors` and the overlay, not `get_request_insights`, which is the performance recorder and reports nothing here.
4. Open the linked page for each distinct insight and apply its fix (usually pull a `<Suspense>` boundary down to the read). Reload to confirm it clears.

## gotchas

- The overlay renders inside a shadow root (`nextjs-portal`), so accessibility-tree snapshots miss it. Read it through `shadowRoot`.
- No browser, no sweep. There is no build-only fallback for this family. Apply the static fix you can from the docs page (gate on type-check) and hand off the live confirmation.

## when this shrinks

Build-time instant validation is opt-in today (`experimental.instantInsights.validationLevel: 'experimental-error'`); the default `'warning'` surfaces in the overlay only. Once the build raises these reliably, the sweep collapses into reading `next build` output and this reference can shrink to that.
