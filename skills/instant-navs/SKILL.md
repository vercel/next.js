---
name: instant-navs
description: >
  Next.js Instant Navigation, PPR shell capture, and `@next/playwright`
  testing. Use when client navigations to a route feel slow, or when
  adding, testing, debugging, or reviewing route shells, loading UI,
  Suspense fallbacks, parallel slot composition, or `unstable_instant`
  tests. Keywords: slow navigation, slow client nav, Instant Navigation,
  PPR, unstable_instant, shell capture, Suspense fallback,
  @next/playwright, loading UI, rootParams, generateStaticParams.
---

# instant-navs

Make App Router routes capture a truthful, fast, stable shell, and prove it
with `@next/playwright`.

## Diagnose Slow Navigations

Use when client navigations to a route feel slow and you have not yet
committed to how invasive the fix should be. This is the diagnostic loop.
It does not require a route marker, a Playwright test, or a build. Add
those only at step 6 if you want to lock the fix in.

1. Enable validation in `next.config.ts`. No per-route opt-in needed at
   this level:

   ```ts
   experimental: {
     instantInsights: { validationLevel: 'warning' },
     instantNavigationDevToolsToggle: true,
   }
   ```

   `cacheComponents: true` is the prerequisite. See Version And Flag
   Requirements below for the full config shape.

2. Run `pnpm next dev` and navigate to the slow route from a sibling
   route. Use a browser if you have one; in a headless context, `curl`
   the route or run a `@next/playwright` `instant()` test from
   Quickstart. Reproduce the slowness. Note whether you see
   `loading.tsx`, a blank frame, or a blocking pause: the classification
   informs later steps.

3. Read the first route-specific diagnostic. Three valid sources, pick
   the one that fits your context:
   - **Browser:** the dev overlay's **Instant Navigation panel** (the
     dedicated surface for blocking-route output). Primary signal.
   - **Headless, interactive (terminal, agent run):** tail dev stdout
     with `__NEXT_SHOW_IGNORE_LISTED=true` so internal frames are not
     collapsed. Stdout is a legitimate primary signal here; the
     diagnostic usually names the exact file and line, and it prints at
     request time (navigate first, then read the request's log window).
   - **Headless, automated (CI, regression):** run the focused
     `@next/playwright` `instant()` test from Quickstart. It observes
     the captured shell directly and gives a positive pass/fail, which
     stdout cannot.

   The panel, the Playwright test, and dev stdout are the sources of
   truth. Do not act on screenshots or vibes.

4. Apply one move from the Boundary Decision Table in
   `references/diagnostic-loop.md`, matched to the named blocker. The
   common cases:
   - `cookies()` / `headers()` above the shell: move the read below
     Suspense, or use a pending provider that exposes shape without
     resolved facts.
   - `params` in a shared layout: switch to `next/root-params` named
     getters; do not `await props.params` for params the layout does
     not own.
   - `useSearchParams()` in a client child: wrap the control in
     Suspense with an inert fallback that reserves layout space.
   - Uncached fetch in a data region: keep the section frame visible,
     suspend only the row, list, or cards.

   The diagnostic usually points to the exact file and line of the
   blocking call; act on that frame first, before consulting the wider
   Debug Ladder.

   Apply the boundary in the segment that owns the data. Hoisting
   `<Suspense>` or `loading.tsx` to a parent layout will render a
   runtime fallback for cross-layout navigations (React's Suspense
   inheritance works), but does not silence the validator and will
   leave sibling navigations within the same parent on an empty
   changing region. See "Composition" below for why.

   The dev runtime also sometimes suggests `export const instant = false`
   in its blocking-route output. Ignore the suggested key: the real key
   is `unstable_instant`, and the route segment schema strips unknown
   keys silently, so a typo compiles and does nothing. The escape-hatch
   form is `export const unstable_instant = false`.

   Move exactly one boundary per iteration. Broad visual cleanup before
   the owner and the blocker are understood wastes iterations.

5. Re-navigate. Loop steps 3 and 4 until the diagnostic source is clean
   for this route. Then confirm the exit positively:
   - A second client navigation to the same route returns in under
     ~100ms with no new `blocking-route` line in dev stdout. In a
     headless run, `curl` timing is a proxy for the in-browser client
     nav, not the real contract; treat sub-100ms there as a smoke
     check, not proof.
   - If you have already added a route-owned `data-instant-boundary`
     marker, also confirm it appears in the response HTML. That
     converts the exit from "no diagnostic" to "shell present and
     named." Without a marker, the timing + clean-stdout pair is
     enough for the diagnostic exit; adding a marker is what Quickstart
     does to harden the result.

   Quiet stdout alone is necessary but not sufficient; a fast second nav
   is the user-visible contract you actually came here to fix.

6. Decide intent. The diagnostic loop is complete. The rest is optional:
   - **Stop here** if you just wanted the page fast.
   - **Prevent regression**: go to Quickstart below to add the route
     marker and the focused Playwright test. Promotion of the route to
     `unstable_instant = { level: 'experimental-error' }` only makes
     sense once that test exists; without a regression test, promotion
     is premature and will surprise the next person who edits the route.
   - **Catch sibling-route fallout**: run `pnpm next build` to surface
     `blocking-route` on neighbors the dev loop never touched. Build is
     a separate signal, not a continuation of the dev loop. Read
     references/diagnostic-loop.md Build And Prerender Triage if it
     reports failures.

When something blocks inside step 4 (the panel reports a diagnostic but
the obvious move does not clear it), drop into the Debug Ladder in
`references/diagnostic-loop.md`.

## Quickstart

Use this path when you want to lock in a fix from the diagnostic loop, or
to adopt Instant Navigation on a new route from scratch. If your trigger
is "this page feels slow," start at Diagnose Slow Navigations above
instead.

Add Instant Navigation to a single route in 5 minutes:

1. Add a stable, route-owned marker to the shell so tests can prove ownership:
   ```tsx
   // app/dashboard/page.tsx
   export default function Dashboard() {
     return <main data-instant-boundary="dashboard">{/* ... */}</main>
   }
   ```
2. Wrap each dataful region in `<Suspense>` with an inert fallback that
   reserves layout space. Keep the page frame above Suspense.
3. Write the focused test:
   ```ts
   import { instant } from '@next/playwright'
   await instant(page, async () => {
     await page.goto('/dashboard', { waitUntil: 'commit' })
     await expect(
       page.locator('[data-instant-boundary="dashboard"]')
     ).toBeVisible()
   })
   ```
4. Run the focused test first, then build:
   ```bash
   pnpm exec playwright test dashboard.spec.ts
   pnpm next build
   ```
5. Against a production build or preview, enable
   `experimental.exposeTestingApiInProductionBuild` for that environment, or
   the `next-instant-navigation-testing` cookie is silently ignored and the
   test observes the loaded UI. Keep the flag off in real production. Dev
   needs no flag.

See `references/playwright-verification.md` for the full pattern with
diagnostics capture and layout-dimension assertions.

## Version And Flag Requirements

This skill targets Next.js **16.3+** and `@next/playwright`. Earlier
versions either lack the testing API or use older config shapes.

**`next.config.ts` (or `next.config.js`):**

```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  // Foundation. Instant Navigation builds on Cache Components / PPR.
  // Without this, there is no captured shell to validate.
  cacheComponents: true,

  experimental: {
    // When and how validation runs. Pick one:
    //   'warning'                      — dev only, every navigation (recommended while iterating)
    //   'manual-warning'               — dev only, routes with `unstable_instant` set
    //   'experimental-error'           — dev + build, every navigation (strict)
    //   'experimental-manual-error'    — dev + build, opted-in routes only
    instantInsights: { validationLevel: 'warning' },

    // Only needed for tests against `next build`/preview. Dev exposes
    // the testing API unconditionally. Do NOT enable in real production.
    exposeTestingApiInProductionBuild: true,

    // Optional. Adds an "Instant Navigation Mode" toggle to the dev
    // tools indicator so you can lock navigations to the cached state.
    instantNavigationDevToolsToggle: true,
  },
}

export default config
```

**Per route (opt-in, opt-out, or fine-grained):**

```ts
// app/dashboard/page.tsx
export const unstable_instant = true
// or, to opt a blocking route out:
export const unstable_instant = false
// or, fine-grained:
export const unstable_instant = {
  // Override the global validation level for this route only.
  // 'experimental-error' promotes one high-value route to strict
  // while the rest of the app stays at 'warning'.
  level: 'experimental-error',

  // Granular escape hatches when full opt-out is too coarse:
  unstable_disableDevValidation: true, // keep build strict, silence dev
  unstable_disableBuildValidation: true, // keep dev warnings, unblock CI
  unstable_disableValidation: true, // skip validation on this subtree entirely
}
```

The config key is `unstable_instant`, not `instant`. The route segment
schema strips unknown keys silently, so a typo compiles and does nothing.
See step 4 of Diagnose Slow Navigations above for the matching runtime
gotcha.

**Test dependency:**

```bash
pnpm add -D @next/playwright @playwright/test
```

`@next/playwright` re-exports `instant(page, fn, options?)`; pass
`{ baseURL }` only when the page has never navigated before entering the
scope.

## Reference Map

- `references/playwright-verification.md`: writing and auditing focused
  `@next/playwright` Instant tests, including the validation order, locator
  discipline, and what makes a test correct.
- `references/diagnostic-loop.md`: triaging blank shells, wrong owners,
  noisy diagnostics, and build/prerender failures. Owns the debug ladder
  and the boundary decision table.
- `references/react-suspense-composition.md`: layout, provider, fallback,
  shell-capture ownership, and data-ownership patterns.
- Bundled `scripts/extract-instant-diagnostics.mjs <log...>`: pulls the first
  route-specific Instant blocker out of large dev or trace logs. Resolve this
  path relative to the installed `instant-navs` skill directory.

## Validation Order

Playwright first, build second. Build cannot observe the captured shell.

1. Audit the focused Instant test for correctness (see
   `references/playwright-verification.md`).
2. Run that focused test; inspect artifacts, route diagnostics, dev logs.
3. Run a local production-like build with the app's supported Node version.
   Use Vercel preview as confirmation, not the primary loop.

Do not invert. A green `next build` does not prove the captured shell, the
captured owner, persistent shared layout, or matching layout dimensions. If
a build ran before the focused test passed, treat it as a compiler smoke
signal and rerun the corrected test before calling the slice validated.

## Rules That Always Apply

These survive any framework improvement; they are about App Router
composition itself.

### Data Semantics

**Use `next/root-params` for generated root params, not `await props.params`.**
When a layout needs a root-generated param (locale, tenant, variant),
import the compiler-generated named getter (one per root param). Awaiting
`props.params` for params the layout does not own can bail static
generation with `NEXT_STATIC_GEN_BAILOUT` or trigger `Expected workStore
to be initialized`.

```tsx
import { locale } from 'next/root-params'
export default async function Layout({ children }) {
  const lang = await locale()
  return <html lang={lang}>{children}</html>
}
```

`next/root-params` is regenerated per project from your `generateStaticParams()`
returns; the exports you see in autocomplete are real, but only inside
Server Components (not Route Handlers or Server Actions).

**Do not read `headers()` or `cookies()` above the Instant shell.** Calling
them in a server component or provider above the captured Suspense
boundary blocks shell capture and surfaces as `NEXT_STATIC_GEN_BAILOUT`.
Move the read below Suspense, or derive equivalent identity from route
params owned by an ancestor.

**Personalized data is never a fallback.** User, account, team, project,
notification, or any per-request fact must either be truly route-known and
stable, or be replaced by an inert pending UI. Stale loaded facts as
fallbacks lie to the user.

**Do not call `headers()` inside `after()`.** `after()` runs outside the
request scope. Read the request data before the `after()` callback and
close over it, or move the work out of `after()`. Same applies to
`cookies()` and other request-scoped APIs.

### Composition

**Suspense is a composition boundary, not a loading flag.** A child
suspends because it naturally reads async/request data. Do not teach
components they are "in an Instant shell" through context, a global flag,
a pathname script, or a DOM marker that toggles loading behavior. Move the
data, not the awareness.

**Instant Navigation validation is segment-scoped because App Router
navigations are segment-scoped.** Each segment is independently
mountable depending on where the user is navigating from. A sibling
navigation within a shared layout (`/dashboard/overview` →
`/dashboard/settings`) only re-renders the changing leaf segment; the
shared layout and its `loading.tsx` stay mounted from the previous
navigation and do not re-fire. A cross-layout navigation (`/about` →
`/dashboard/settings`) mounts the dashboard layout fresh and its
`loading.tsx` does cover the suspending settings page. The two
navigation sources land on the same route through different segment
boundaries.

For a route's shell to be capturable from any navigation source, each
segment must contribute its own piece of the shell: its own local
`<Suspense>` around any suspending data, or its own `loading.tsx`. A
parent layout's `<Suspense>` around `{children}` does not protect a
child page segment's suspending data, even if the fallback is non-null
and streams correctly. A parent segment's `loading.tsx` renders fine at
runtime when the parent itself is being mounted fresh, but for sibling
navigations within that parent the changing segment is on its own. The
validator enforces this by requiring the boundary to live in the
suspending segment itself.

The runtime currently surfaces this as "accessed outside of
`<Suspense>`", which reads as wrong when an ancestor Suspense exists;
treat the message as "outside of a Suspense within this segment."

**Initial-load and client-navigation tests differ.** On cold initial load,
an inert fallback control (a disabled button, readonly input) is a
legitimate captured shell. During client navigation from a loaded source
route, the same control should remain resolved while the shell is
captured; a skeleton there means the persistent shared layout resuspended.

### Routing

**Persistent shared layout cannot survive crossing parent owners.** A
header, sidebar, or switcher only stays mounted across navigations when
source and destination share the same parent route owner. If they do not,
either stabilize the owner across the navigation or hoist the shared
layout above the changing segment. A client router cannot rescue a remount
that the App Router caused.

**Parallel slot defaults must match the route variant.** A scoped variant
that falls back through a shared header/sidebar slot must not pull a
default from a different variant family (for example, a logged-in route
pulling a logged-out default). Derive the fallback from `next/root-params`
or use a route-local default; a generic default leaks the wrong shell.

**PPR plus `notFound()` under parallel routes can serve 200.** A
server-side `notFound()` inside a PPR + parallel-route leaf can stream as
a 200 shell with React error #419 and stay stuck on the loading boundary.
If the visible contract is the not-found UI and the route already streams
shell semantics, return a route-owned `NotFound` component directly from
the missing-data branch and document the HTTP status tradeoff.

### Hydration

**A client router arbitrating slots cannot trust `usePathname()` for first
paint.** After a rewrite, the server slot tree is the truth for the first
paint; the browser-visible URL is only available after hydration. If a
client router picks between `children` and a parallel slot, render what
the server provided until mount, then switch to pathname-based
arbitration. Add a no-hydration Playwright test when first paint must
already be correct.

## Marker Convention

Use one route-owned attribute to prove ownership:

```tsx
<main data-instant-boundary="dashboard">{/* ... */}</main>
```

Rules:

- One marker per captured boundary. The value names the route.
- Markers prove ownership; they must not alter behavior. No "instant mode"
  marker that components read to fake loading.
- If a test also needs an interaction target (button, input), use a
  separate `data-testid` on that specific control. Do not overload the
  boundary marker with test-target duties.

## When Not To Use Instant

Consider opting out (only after user approval) when a route has no useful
stable shell: immediate redirects, auth handoff, admin/debug/internal with
low user value, or routes whose first meaningful UI depends on
unrecoverable request-only state. Record the tradeoff and keep the route's
normal loaded state tested. Treat `export const unstable_instant = false`
and `connection()` as emergency escape hatches that require approval, not
routine tools.

## Related Primitives

- **Cache Components / `use cache`**: stable data above the shell often
  belongs in a cached function with `cacheTag` and `cacheLife`, not in an
  awaited fetch.
- **PPR (`experimental.ppr`)**: Instant Navigation builds on PPR. A
  route's captured shell is its prerendered prefix; the rest streams.
- **`next/root-params`**: the supported way to read generated root params
  below the owner that generates them.
- **`generateStaticParams()`**: the static-ownership claim that makes a
  dynamic segment capturable.
- **`@next/playwright` `instant()`**: the only way to observe the captured
  shell in tests; honor the production-testing flag when not in dev.

## Acceptance

Before calling work done:

- Focused Instant test ran first, audited for correctness, and passed.
- Route works outside Instant capture in its normal loaded state.
- Captured boundary is proven and owned by the rewritten internal route tree.
- Console and dev stdout show no route-specific Instant validation failures.
- Captured-shell layout dimensions match the loaded UI within tight tolerances.
- Local production-like build passes (or remaining blocker is documented).
- No reliance on `connection()`, `unstable_instant = false`, pathname
  scripts, private internals, or child-side shell detection to force the
  shell.
- Final explanation names what is shared, what remains dynamic, and any
  known environment limitations.

## Related Skills

These are companion skills in the external published skill bundle. Use them
when they are installed alongside `$instant-navs`.

- `$next-cache-components-optimizer`: grow the static shell or optimize in-app
  navigation when the route uses `cacheComponents: true`. Instant tests assert
  what that optimizer produces.
- `$next-dev-loop`: the underlying dev-server verification rhythm
  (`/_next/mcp` + `agent-browser`). Use it to observe runtime behavior while
  iterating on a shell; this skill layers the Playwright test on top.
