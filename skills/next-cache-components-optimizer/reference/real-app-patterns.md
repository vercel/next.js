# Real-app patterns

The rest of this skill models a single linear `layout → page` tree. Production App Router routes add **parallel routes, shared layout UI, and auth gates**, which is where most of the real static-shell work happens. These patterns bridge that gap. Read the skill's `SKILL.md` first.

## Parallel routes: each slot is its own boundary

Instant validation treats every parallel-route slot below the shared layout as an **independent** navigation boundary. Consequences:

- **Each `@slot` needs its own `<Suspense>`** around its dynamic reads; a boundary in one slot does not cover another.
- **An uncovered dynamic read in any slot blocks the whole navigation.** A perfect `@content` does not help if `@sidebar` awaits a session at the top.
- **A slot that renders `null` (e.g. `default.tsx`) is shell-safe**: it is static and performs no reads. Slots that do not re-render for this navigation cost nothing.

```
[tenant]/layout.tsx         (shared: already mounted on a soft navigation; not re-rendered)
  ├ @content  → settings/layout → billing/page     ← guard each slot's dynamic reads…
  ├ @sidebar  → side nav                            ← …here too (independent boundary)
  └ @header   → default.tsx → null                  ← free
```

## Client-rendered slot routing is not part of the soft-navigation re-render

A common pattern: a stable shared layout renders `@header`/`@sidebar` through a **client** component that swaps slot content based on `usePathname()`. On a soft navigation, Next.js only re-renders the **server** segments that changed below the shared layout; a client-component subtree is not part of that re-render. So that navigation UI neither blocks the navigation nor needs a server `<Suspense>` for it; only the server segments that actually change (e.g. `@content`) matter. It does participate in an initial load (see the caveat below).

## "Instant" is not "useful shell": the empty-shell failure mode

Validation checks that a dynamic read is **guarded by a boundary**, not that the fallback is non-empty. A `<Suspense>` with no `fallback` (or `fallback={null}`) passes validation and commits instantly, but renders a **blank** shell. If a layout and its page both `await getSession()` (your auth library's request-time read) at the top under one empty-fallback boundary, the whole frame collapses to nothing while the user waits. "Validates as instant" and "good loading experience" are different goals.

> Give every boundary a real loading skeleton, and place it low so the most real content stays in the shell. A `fallback={null}` directly above `<body>` is a deliberate empty-shell opt-out; an empty fallback lower in the tree is almost always a bug.

## The responsive-skeleton mismatch: the shell must match every breakpoint

A loading skeleton that misaligns with the loaded UI is its own bug, and it usually appears on mobile. A hand-built skeleton encodes one layout; the real component is responsive and changes shape at breakpoints, so a desktop-shaped skeleton no longer lines up once the viewport is small.

A concrete shape: a list-detail view renders a list or tree in a side panel on desktop, but collapses that panel into a single dropdown or drawer on mobile (with its own loading state). A row skeleton built for the desktop panel has nothing to align with on mobile.

The fix is the same push-down as everywhere else: **share the real responsive layout between the live render and the shell render.** One responsive component renders both (its data slots show the reused `*Skeleton` in the shell and real data after the stream), so the breakpoint switch happens once, for both renders, and there is no second desktop-only skeleton to drift.

(Same hoist rule, responsive layout included.) Verify the shell at both desktop and mobile widths against the real render at the same width.

## Deferring an auth gate / top-level `await` in a layout

A top-level `await` in a layout blocks everything below it (the most common blocker; see [Runtime data during prerendering](https://nextjs.org/docs/messages/blocking-prerender-runtime)). Auth gates are the most common real instance:

```tsx
// ❌ Before: the await + redirect at the top blocks the whole settings frame
export default async function SettingsLayout({ children }) {
  const session = await getSession() // your auth library's request-time read; suspends during prerender → frame can't build
  if (!session?.user) redirect(getLoginUrl())
  return <Shell>{children}</Shell>
}
```

```tsx
// ✅ After: render children unconditionally; move the gate into a Suspense child
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

The shell prerenders as if authorized (the session read suspends before `redirect()` is reached, so the redirect only happens at request time), and `{children}` is now in the shell instead of behind the gate. (`fallback={null}` is correct here: `AuthGate` renders nothing on success.)

## Initial-load shell vs soft-navigation shell

The `test-template.md` specs drive a `<Link>` click for soft navigations and `page.goto()` for initial loads. The two shells can differ for the same route:

> **The initial-load shell can show less than the soft-navigation shell when a layout above the shared boundary awaits un-enumerated `params`/`searchParams`.** An initial load re-runs every layout from the root; if a parent layout does `await props.params` and that segment has no `generateStaticParams`, the param suspends on the initial load and its whole subtree drops out of the shell. A soft navigation does not re-render that parent and already has the params. Symptom: an element present after a `<Link>` click is missing after `goto`.

To assert the soft-navigation shell, drive a real `<Link>` click (through menus if necessary). Use `page.goto()` inside `instant()` to assert the initial-load shell, or when no parent above the shared boundary awaits un-enumerated params, in which case the two coincide.

## Edge cases

- **A `React.cache` (or custom memoization) wrapper around `cookies()`/`headers()` still suspends.** Memoizing the call does not make it shell-safe: the underlying request read still returns a pending promise during prerender. Only the **`use cache`** directive, keyed on static or param inputs, puts data in the shell.
- **Playwright cannot see a `display: contents` or fragment fallback.** Such a fallback reads as hidden, so `instant()` assertions cannot `toBeVisible()` it. Give fallbacks a real wrapper element with a `data-testid`.
