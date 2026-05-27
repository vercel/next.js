---
name: instant-navs
description: >
  Next.js Instant Navigation, PPR shell capture, and `unstable_instant`
  workflow. Use when adding, testing, debugging, or reviewing instant route
  shells, loading UI, route-owned Suspense fallbacks, parallel slot
  composition, or `@next/playwright` instant tests. Covers shell capture
  rules, Suspense placement, hidden-DOM filtering, and the Playwright-first
  validation ladder. Keywords: Instant Navigation, PPR, unstable_instant,
  shell capture, Suspense fallback, @next/playwright, route shells,
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
2. Wrap each dataful region in `<Suspense>` with an inert fallback that reserves layout space. Keep the page frame above Suspense.
3. Write the focused test (see [references/playwright-verification.md](./references/playwright-verification.md) for the full pattern):
   ```ts
   import { instant } from '@next/playwright'
   await instant(page, async () => {
     await page.goto('/dashboard', { waitUntil: 'commit' })
     await expect(
       page.locator('[data-instant-boundary="dashboard"]')
     ).toBeVisible()
   })
   ```
4. Run the focused test first, then run `next build`:
   ```bash
   pnpm exec playwright test dashboard.spec.ts
   pnpm next build
   ```
5. If running against a production build or preview, enable
   `experimental.exposeTestingApiInProductionBuild` for that environment, or
   the `next-instant-navigation-testing` cookie is silently ignored and the
   test observes the loaded UI.

## Reference Map

- [references/diagnostic-loop.md](./references/diagnostic-loop.md): blank shells, wrong owners, confusing diagnostics, build/prerender triage.
- [references/playwright-verification.md](./references/playwright-verification.md): writing and auditing `@next/playwright` Instant tests.
- [references/react-suspense-composition.md](./references/react-suspense-composition.md): layout, provider, fallback, and data ownership patterns.
- `scripts/extract-instant-diagnostics.mjs <log...>`: pulls the first route-specific Instant blocker out of large dev or trace logs.

## Validation Ladder

Order matters. Playwright first, build second:

1. Identify the focused Instant test for the slice and audit it (see below for what makes it correct).
2. Run that focused test; inspect artifacts, route diagnostics, and dev logs.
3. Run a local production-like build with the app's supported Node version. Use Vercel preview as confirmation, not as the primary loop.

Do not invert. A green `next build` does not prove the captured shell, the captured route owner, persistent shared layout, or matching layout dimensions. If a build ran before the focused test passed, label it a compiler smoke signal and rerun the corrected test before calling the slice validated.

## Ten Rules That Always Apply

These survive any framework improvement; they are about App Router composition itself.

### 1. Use `rootParams()` for generated root params, not `await props.params`

When a layout needs a root-generated param (locale, tenant, variant), import the getter from `next/root-params`. Awaiting `props.params` for params the layout does not own can bail static generation with `NEXT_STATIC_GEN_BAILOUT` or trigger `Expected workStore to be initialized`.

```tsx
import { locale } from 'next/root-params'
export default async function Layout({ children }) {
  const lang = await locale()
  return <html lang={lang}>{children}</html>
}
```

### 2. Do not read `headers()` or `cookies()` above the Instant shell

Calling them in a server component or provider above the captured Suspense boundary blocks shell capture and surfaces as `NEXT_STATIC_GEN_BAILOUT`. Move the read below Suspense, or derive equivalent identity from route params owned by an ancestor.

### 3. Personalized data is never a fallback

User, account, team, chat, project, notification, or any per-request fact must either be truly route-known and stable, or be replaced by an inert pending UI. Stale loaded facts as fallbacks lie to the user.

### 4. Suspense is a composition boundary, not a loading flag

A child suspends because it naturally reads async/request data. Do not teach components they are "in an Instant shell" through context, a global flag, a pathname script, or a DOM marker that toggles loading behavior. Move the data, not the awareness.

### 5. Initial-load and client-navigation tests differ

On cold initial load, an inert fallback control (a readonly textarea, a disabled button) is a legitimate captured shell. During client navigation from a loaded source route, the same control should remain resolved while the shell is captured; a skeleton there means the persistent shared layout resuspended.

### 6. Persistent shared layout cannot survive crossing parent owners

A header, sidebar, or switcher only stays mounted across navigations when source and destination share the same parent route owner. If they do not, either stabilize the owner across the navigation or hoist the shared layout above the changing segment. A client router cannot rescue a remount that the App Router caused.

### 7. PPR plus `notFound()` under parallel routes can serve 200

A server-side `notFound()` inside a PPR + parallel-route leaf can stream as a 200 shell with React error #419 and stay stuck on the loading boundary. If the visible contract is the not-found UI and the route is already streamed shell semantics, return a route-owned `NotFound` component directly from the missing-data branch and document the HTTP status tradeoff.

### 8. A client router arbitrating slots cannot trust `usePathname()` for first paint

After a rewrite, the server slot tree is the truth for the first paint; the browser-visible URL is only available after hydration. If a client router picks between `children` and a parallel slot, render what the server provided until mount, then switch to pathname-based arbitration. Add a no-hydration Playwright test when first paint must already be correct.

### 9. Parallel slot defaults must match the route variant

A logged-in scoped route that falls back through a shared header/sidebar slot must not pull a logged-out default from another route family. Derive the fallback from `next/root-params` or use a route-local default; a generic default leaks the wrong auth/variant shell.

### 10. Do not call `headers()` inside `after()`

`after()` runs outside the request scope. The error currently does not point at the call site, so wrap the read or move it to the request body. (This is also true for `cookies()` and other request-scoped APIs.)

## Shell Capture Rules

- **Prove ownership before refactoring UI.** A visible URL may rewrite through a different internal owner. Add a route-owned marker (`data-instant-boundary="..."`) or inspect the captured shell DOM to identify the captured boundary first.
- **Static owner = route file plus the right `generateStaticParams()`.** For every dynamic segment on the owner path, check the rewrite value against `generateStaticParams()`. A non-generated dynamic param produces an empty captured shell with no obvious page marker.
- **A parent layout's `generateStaticParams()` does not cover a new generated page owner.** If a page owns a hidden static segment, export the concrete static params on that page too.
- **Treat `generateStaticParams()` as a static shell-ownership claim, not a route-table detail.** If the layout exports static params but providers or slots above the inert boundary still start request-backed work, the route is not actually static.
- **Audit sibling parallel slots when restoring static ownership.** A content page fallback does not protect `@header`, `@sidebar`, or other slots from their own `params`, `searchParams`, `headers()`, or `cookies()` reads.

## Test Correctness

A passing test that cannot fail for the right reasons is not Instant evidence. Before trusting a focused Playwright test, confirm it would fail for:

- the wrong route owner,
- a hidden duplicate shell,
- stale persistent shared layout,
- route-specific blocking diagnostics,
- a bad HTTP status when the route fully loads,
- visual layout drift.

### Common test-side traps

- **Hidden React 19 staging DOM.** Strict locators like `h1`, `getByText`, or shared `data-testid` values match `<div hidden id="S:...">` Suspense staging payloads in addition to visible DOM. Scope assertions to a route-owned container or use role-based visible locators (`getByRole('button', { name: /.../ })`).
- **Interactive helpers typing into inert shell controls.** A fallback prompt surface can be a valid layout-dimension marker while its textarea is `aria-hidden` or `readonly`. Submit helpers must require a visible, enabled, editable control.
- **`waitUntil: 'domcontentloaded'` missing fast-resolving shells.** When the captured shell releases before the first locator poll, use `waitUntil: 'commit'` inside `instant(...)`. Keep post-release assertions.
- **Asserting before the navigation started.** If a click immediately polls for the target boundary without waiting for the real target RSC request or URL transition, the test spends its timeout inspecting the old page.
- **Prefetch races on stale-data tests.** When freezing payloads, ignore RSC requests with `next-router-prefetch: 1`; otherwise the test asserts before the real navigation captures the shell.
- **Broad `page.route('**/\*')`probes starving narrower handlers.** Use`route.fallback()`for non-matching requests, not`route.continue()`, so earlier fixture handlers still run.
- **Do not rely on `networkidle` in dev.** Prefer the earliest truthful event: `commit`, `domcontentloaded`, visible DOM, app readiness markers, or post-release assertions.

## Debug Ladder

When something fails, investigate in order:

1. **Prove the route works outside `instant(...)` in its normal loaded state.** Auth, env, provider, module resolution, and unrelated render errors make Instant evidence inconclusive.
2. **Read the first route-specific Next diagnostic.** Dev stdout often has more precise blocking-route output than the browser overlay. For large logs, run `scripts/extract-instant-diagnostics.mjs <files>`.
3. **Prove route ownership.** Compare visible URL to middleware/rewrites/parallel slots. Confirm the owner is statically generated for the current variant tuple.
4. **Move exactly one boundary.** Move the runtime read, provider, or Suspense boundary named by the diagnostic. Avoid broad visual cleanup until owner and blocker are understood.
5. **Restart dev only when stale.** Delete `.next` only when you have stale-dev-server evidence: contradictory diagnostics, removed code still executing, or Turbopack cache restore failures. Do not delete reflexively.

### Classify before patching source

When a Playwright failure could be a test-side bug, check these patterns first:

- hidden-DOM match (strict locator hitting `<div hidden>` staging)
- prefetch race (assertion fires before real navigation)
- viewport visibility (target rendered but offscreen)
- selector specificity (matches popovers, virtualization, Radix triggers)

If yes, fix the test before editing source.

## Boundary Decision Table

Use the first blocker to choose the smallest useful move:

| Blocker                                                                | Prefer                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cookies()`, `headers()`, session, user, flags                         | Keep shared frame above Suspense; move stateful region below; or use a pending provider that exposes shape without resolved facts                      |
| `params` / root params in shared layout or sibling parallel slot       | Use `rootParams()` getters from `next/root-params`; read only params the layout owns; audit sibling `@header`/`@sidebar` slots                         |
| Per-request identity (scope, tenant, team) drifting across navigations | Include the identity in cache keys, request de-dupe keys, and SWR keys; do not rely only on request headers                                            |
| Localized shell text                                                   | Treat locale as part of the route/variant tuple, or suspend the localized region; default locale only in inert fallback                                |
| `useSearchParams()`, router/query-state hooks                          | Wrap the client control in Suspense with an inert box-model fallback                                                                                   |
| Uncached fetch or async data section                                   | Keep the section frame visible; suspend only the data row/list/cards                                                                                   |
| Optional lower-page data throws                                        | Isolate with a local degraded frame or route error boundary; do not let a catalog query block the primary shell                                        |
| Function-valued translation crash (`t('key')(...)` is not a function)  | Verify locale provider and missing-key fallback shape before treating as an Instant blocker                                                            |
| Render recursion or stack overflow during capture                      | Check whether a server Suspense fallback imports through a `"use client"` module; split inert fallback UI into a server-safe module                    |
| Strict Playwright failure with two matching visible-shell locators     | Inspect trace snapshot for hidden streaming DOM first. One visible: fix the test with a visible-scoped selector. Two visible: fix the app architecture |
| Blank captured shell                                                   | Inspect parent layout/provider/null fallback and verify the rewritten owner matches generated params before editing page skeletons                     |
| Wrong route/auth shell                                                 | Prove rewrites and owner; do not render multiple candidate shells and hide one                                                                         |
| Persistent shared layout resuspends on client nav                      | Fix route/layout architecture; check changing parallel slots, keyed subtrees, or client mount gates before tuning child fallbacks                      |
| Visual layout drift                                                    | Fix shared frame or fallback box model before changing tolerance                                                                                       |

## Marker Convention

```tsx
<main data-instant-boundary="dashboard" data-testid="dashboard-main-frame">
  {/* ... */}
</main>
```

Use markers to prove ownership, not to alter behavior. Do not add an "instant mode" marker that components read to fake loading.

## When Not To Use Instant

Consider opting out (only after user approval) when a route has no useful stable shell: immediate redirects, auth handoff, admin/debug/internal with low user value, or routes whose first meaningful UI depends on unrecoverable request-only state. Record the tradeoff and keep the route's normal loaded state tested. Treat `instant: false` and `connection()` as emergency escape hatches that require approval, not routine tools.

## Related Primitives

- **Cache Components / `use cache`**: stable data above the shell often belongs in a cached function with `cacheTag` and `cacheLife`, not in an awaited fetch.
- **PPR (`experimental.ppr`)**: Instant Navigation builds on PPR. A route's captured shell is its prerendered prefix; the rest streams.
- **`next/root-params`**: the supported way to read generated root params below the owner that generates them.
- **`generateStaticParams()`**: the static-ownership claim that makes a dynamic segment capturable.
- **`@next/playwright` `instant()`**: the only way to observe the captured shell in tests; honor the production-testing flag when not in dev.

## Acceptance

Before calling work done:

- Focused Instant test ran first, audited for correctness, and passed.
- Route works outside Instant capture in its normal loaded state.
- Captured boundary is proven and owned by the rewritten internal route tree.
- Console and dev stdout show no route-specific Instant validation failures.
- Captured-shell layout dimensions match the loaded UI within tight tolerances.
- Local production-like build passes (or remaining build blocker is documented with owner).
- No reliance on `connection()`, `instant: false`, pathname scripts, private internals, or child-side shell detection to force the shell.
- Final explanation names what is shared, what remains dynamic, and any known environment limitations.

## Related Skills

- `$next-cache-components-optimizer` — when the route uses `cacheComponents: true` and you need to grow the static shell (page-render loop) or optimize in-app A → B navigation (nav loop). Instant tests assert what that optimizer produces.
- `$next-dev-loop` — the underlying dev-server verification rhythm (`/_next/mcp` + `agent-browser`). Use it to observe runtime behavior while iterating on a shell; this skill layers the Playwright test on top.
