---
name: instant-navs
description: >
  Next.js Instant Navigation, PPR shell capture, and `@next/playwright`
  testing. Use when adding, testing, debugging, or reviewing route shells,
  loading UI, Suspense fallbacks, parallel slot composition, or
  `unstable_instant` tests. Keywords: Instant Navigation, PPR,
  unstable_instant, shell capture, Suspense fallback, @next/playwright,
  loading UI, rootParams, generateStaticParams.
---

# instant-navs

Make App Router routes capture a truthful, fast, stable shell, and prove it
with `@next/playwright`.

## Quickstart

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

## Reference Map

- `references/playwright-verification.md`: writing and auditing focused
  `@next/playwright` Instant tests, including the validation order, locator
  discipline, and what makes a test correct.
- `references/diagnostic-loop.md`: triaging blank shells, wrong owners,
  noisy diagnostics, and build/prerender failures. Owns the debug ladder
  and the boundary decision table.
- `references/react-suspense-composition.md`: layout, provider, fallback,
  shell-capture ownership, and data-ownership patterns.
- `scripts/extract-instant-diagnostics.mjs <log...>`: pulls the first
  route-specific Instant blocker out of large dev or trace logs.

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

**Use `rootParams()` for generated root params, not `await props.params`.**
When a layout needs a root-generated param (locale, tenant, variant),
import the getter from `next/root-params`. Awaiting `props.params` for
params the layout does not own can bail static generation with
`NEXT_STATIC_GEN_BAILOUT` or trigger `Expected workStore to be initialized`.

```tsx
import { locale } from 'next/root-params'
export default async function Layout({ children }) {
  const lang = await locale()
  return <html lang={lang}>{children}</html>
}
```

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
request scope. The error currently does not point at the call site, so
wrap the read or move it to the request body. Same applies to `cookies()`
and other request-scoped APIs.

### Composition

**Suspense is a composition boundary, not a loading flag.** A child
suspends because it naturally reads async/request data. Do not teach
components they are "in an Instant shell" through context, a global flag,
a pathname script, or a DOM marker that toggles loading behavior. Move the
data, not the awareness.

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
normal loaded state tested. Treat `instant: false` and `connection()` as
emergency escape hatches that require approval, not routine tools.

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
- No reliance on `connection()`, `instant: false`, pathname scripts,
  private internals, or child-side shell detection to force the shell.
- Final explanation names what is shared, what remains dynamic, and any
  known environment limitations.

## Related Skills

- `$next-cache-components-optimizer`: grow the static shell or optimize
  in-app navigation when the route uses `cacheComponents: true`. Instant
  tests assert what that optimizer produces.
- `$next-dev-loop`: the underlying dev-server verification rhythm
  (`/_next/mcp` + `agent-browser`). Use it to observe runtime behavior
  while iterating on a shell; this skill layers the Playwright test on top.
