# Real-app patterns

The rest of this skill models a single linear `layout → page` tree. Production App Router routes add **parallel routes, shared layout UI, and auth gates** — where most of the real static shell and App Shell work happens. These patterns bridge that gap. Read the skill's `SKILL.md` and `patterns.md` first.

## Parallel routes — each slot is its own boundary

Instant validation treats every parallel-route slot below the shared layout as an **independent** navigation boundary. Consequences:

- **Each `@slot` needs its own `<Suspense>`** around its dynamic reads — a boundary in one slot does not cover another.
- **An uncovered dynamic read in any slot blocks the whole navigation.** A perfect `@content` does not help if `@sidebar` awaits a session at the top.
- **A slot that renders `null` (e.g. `default.tsx`) is shell-safe** — static, no reads. Slots that do not re-render for this navigation cost nothing.

```
[tenant]/layout.tsx         (shared — already mounted on a soft navigation; not re-rendered)
  ├ @content  → settings/layout → billing/page     ← guard each slot's dynamic reads…
  ├ @sidebar  → side nav                            ← …here too (independent boundary)
  └ @header   → default.tsx → null                  ← free
```

## Client-rendered slot routing is not part of the soft-navigation re-render

A common pattern: a stable shared layout renders `@header`/`@sidebar` through a **client** component that swaps slot content based on `usePathname()`. On a soft navigation, Next.js only re-renders the **server** segments that changed below the shared layout — a client-component subtree is not part of that re-render. So that navigation UI neither blocks the navigation nor needs a server `<Suspense>` for it; only the server segments that actually change (e.g. `@content`) matter. It does participate in an initial load — see the caveat below.

## "Instant" is not "useful shell" — the empty-shell failure mode

Validation checks that a dynamic read is **guarded by a boundary**, not that the fallback is non-empty. A `<Suspense>` with no `fallback` (or `fallback={null}`) passes validation and commits instantly — but contributes a **blank fallback** to the static shell or App Shell. If a layout and its page both `await getSession()` at the top under one empty-fallback boundary, the static prerender can collapse the whole frame to nothing while the user waits. A session-specific App Shell may resolve cookies or headers and expose more, so inspect the actual A1 contract rather than assuming it is blank. "Validates as instant" and "good loading experience" are different goals.

> Give every boundary a real loading skeleton, and place it low so the most real content stays in the shell. A `fallback={null}` directly above `<body>` is a deliberate empty-shell opt-out; an empty fallback lower in the tree is almost always a bug.

## The responsive-skeleton mismatch — the shell must match every breakpoint

A loading skeleton that misaligns with the loaded UI is its own bug, and it usually appears on mobile. A hand-built skeleton encodes one layout; the real component is responsive and changes shape at breakpoints, so a desktop-shaped skeleton no longer lines up once the viewport is small.

A concrete shape: a list–detail view renders a list or tree in a side panel on desktop, but collapses that panel into a single dropdown or drawer on mobile (with its own loading state). A row skeleton built for the desktop panel has nothing to align with on mobile.

The fix is the same push-down as everywhere else: **share the real responsive layout between the live render and the shell render.** One responsive component renders both — its data slots show the reused `*Skeleton` in the shell and real data after the stream — so the breakpoint switch happens once, for both renders, and there is no second desktop-only skeleton to drift.

(Same hoist rule, responsive layout included.) Verify the shell at both desktop and mobile widths against the real render at the same width.

## Deferring an auth gate / top-level `await` in a layout

A top-level `await` in a layout blocks everything below it (the most common blocker, `patterns.md` #1–#2). Auth gates are the most common real instance:

```tsx
// ❌ Before — the await + redirect at the top blocks the whole settings frame
export default async function SettingsLayout({ children }) {
  const session = await getSession() // your auth library's request-time read; suspends during prerender → frame can't build
  if (!session?.user) redirect(getLoginUrl())
  return <Shell>{children}</Shell>
}
```

```tsx
// ✅ After — render children unconditionally; move the gate into a Suspense child
import { Suspense } from 'react'

export default function SettingsLayout({ children }) {
  return (
    <Shell>
      <Suspense fallback={null}>
        <AuthGate />
      </Suspense>
      {children}
    </Shell>
  )
}

async function AuthGate() {
  const session = await getSession() // the session read suspends during prerender…
  if (!session?.user) redirect(getLoginUrl()) // …so redirect() never runs at build time
  return null
}
```

The static shell prerenders as if authorized — the session read suspends before `redirect()` is reached, so the redirect only happens at request time — and `{children}` is now outside that gate. A session-specific App Shell may resolve the session and redirect instead. (`fallback={null}` is correct here: `AuthGate` renders nothing on success.)

## Dev-overlay observation (optional)

Trustworthy measurement uses the production-build rig (SKILL.md phase A; `next dev`'s `instant()` is unreliable for blocking routes). As an additional observation channel while authoring, the dev overlay can shorten iteration:

1. `export const instant = true` on the target route (safe — see "Edge cases").
2. Run `next dev`. The Navigation Inspector is available automatically when `cacheComponents` is enabled — no extra flag. (`instantInsights.validationLevel` defaults to `'warning'`, dev-only; it need not be raised to use the inspector.)
3. Open Next.js DevTools → **Navigation Inspector** → **Start Capturing**, then refresh to freeze the initial static UI, or click a link to freeze the destination's actual prefetched UI. Under Partial Prefetching a default Link shows the App Shell, while a `prefetch={true}` Link may show more. Each suspended boundary identifies a deferred read outside that contract, with its source frame. Decide whether its fallback is useful, the data should be cached, or a selected link merits runtime prefetching; then repeat.
4. **Continue Rendering** lets the stream finish so you can compare the shell against the resolved UI.

## URL-specific static shell vs App Shell vs link-prefetched UI

The `test-template.md` specs drive a `<Link>` click for soft navigations and `page.goto()` for initial loads. Three artifacts can differ for the same route:

- The **static shell** is a concrete URL-specific prerender used for an initial load when one exists.
- The **App Shell** is the reusable per-route floor. With Cache Components, it can be the direct-visit/ISR fallback for an ungenerated URL. Partial Prefetching also makes it the UI fetched by a default Link. It excludes non-root `params`, `searchParams`, and full-URL-specific content, but may include session-specific cookies/headers.
- The **link-prefetched UI** follows the actual Link. `prefetch={true}` can extend the App Shell with cached page content, and an `allow-runtime` destination can add eligible per-link URL data.

> **The initial-load immediate UI can show less than an extended link-prefetched result when a layout above the shared boundary awaits un-enumerated `params`/`searchParams`.** An initial load re-runs every layout from the root; if a parent layout does `await props.params` and that segment has no `generateStaticParams`, the param suspends and its subtree drops out of the reusable App Shell fallback. A full/runtime prefetch may already know that URL data. Do not infer that it belongs to the shared App Shell.

To assert soft-navigation behavior, drive the exact real `<Link>` inspected in phase A1 (through menus if necessary) and assert the UI its contract permits. Use `page.goto()` inside `instant()` to assert the initial-load immediate UI: a URL-specific static shell when one exists, otherwise the App Shell fallback. Do not substitute one for the other even when they happen to coincide.

## Edge cases

- **`instant = true` does not fail the build under a `warning` level.** `true` opts in at the default level; only a per-route `{ level: 'experimental-error' }` or a global `experimental-*-error` level fails builds. So `true` is a safe permanent regression marker.
- **A `React.cache` (or custom memoization) wrapper around `cookies()`/`headers()` still suspends during the static prerender.** Memoizing the call does not make it static-shell-safe. During App Shell generation, cookies/headers may resolve into a session-specific shell; this is separate from `React.cache` and does not put them in the shared static document shell.
- **Playwright cannot see a `display: contents` or fragment fallback.** Such a fallback reads as hidden, so `instant()` assertions cannot `toBeVisible()` it. Give fallbacks a real wrapper element with a `data-testid`.
