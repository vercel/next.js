---
name: instant-nav
description: Make a Next.js route render instantly under Cache Components / PPR — on initial load (hard navigation) and on client-side navigation (soft navigation) — by formulating the goal as a failing @next/playwright instant() e2e and working it to green; the shipped test then guards against regression. Use when asked to make a navigation instant, fix a route whose static shell isn't served or prefetched, or write the instant() e2e guard for one. A setup phase discovers the project's build/deploy/test infrastructure (Vercel, generic CI, or local-only) and records it in a project-local rig file. Covers the RED-test trustworthiness gate, the Suspense push-down fix patterns, and the parity check that the refactor changed only the instancy.
---

# instant-nav

Take one route from "not instant" to "instant" with a test-driven loop:
encode the goal as a failing `@next/playwright` `instant()` test, make it
green, and ship the test as the regression guard. Work the phases 0 → G in
order; each ends in a gate. Fix recipes live in two lazily-read references —
`reference/patterns.md` (before→after for each blocker type) and
`reference/real-app-patterns.md` (parallel routes, auth gates, the blank-shell
and responsive-skeleton traps). Read one only when its phase points there.

## Two navigations, two loading states

A route reaches the user in two ways. Both must be instant:

- **Initial load (hard navigation).** The browser requests the document. With
  PPR, the server responds immediately with the route's prerendered **static
  shell**; dynamic content streams in afterward. The loading state is the
  shell itself: the layout UI, plus the loading skeletons (Suspense fallbacks,
  `loading.tsx`) of the deferred parts.
- **Client-side navigation (soft navigation).** The router commits the
  destination's prefetched static shell when the link is activated; only the
  route segments that change re-render, and dynamic data streams in afterward.
  The loading state is the prefetched shell, with the same loading skeletons.

The fix patterns are identical for both. The test differs only in how the
navigation is driven — `page.goto()` for the initial load, a real `<Link>`
click for the client-side navigation (`test-template.md`). The two shells can
differ for the same route (see the caveat in
`reference/real-app-patterns.md`), so test the case you are shipping; guard
both when both matter.

## Goal

Maximize the static shell: the most meaningful prerendered content commits
immediately, and only genuinely per-request data streams in afterward. The bar
is **present ∧ instant ∧ non-blank** — an `instant()` pass alone is not
sufficient, because a blank `fallback={null}` shell also passes (the
blank-shell trap, `reference/real-app-patterns.md`). And the refactor must
change only this property — nothing else about what the route renders
(phase E).

`instant()` is a ruler, not a stopwatch: assert that the shell appears under
the lock; do not time it. A trustworthy verdict requires a production build
(phase A) — `next dev`'s `instant()` is unreliable for blocking routes and
reports a false pass after ~5s.

## Formulate it as a verification problem

"Make this route instant" is an open-ended optimization; agents work best on
verification problems. This skill converts one into the other: a RED test that
encodes the goal, a deterministic verdict to work toward, and a GREEN that
means done — after which the same test prevents regression. The gates exist to
keep the verdict trustworthy; a reliable verdict is what allows the fix loop
to run unattended. The principles below are
environment-independent. Your infrastructure is not, so phase 0 discovers the
project's actual build/deploy/test flow rather than assuming a platform.

## The workflow

```
- [ ] 0  SETUP        once per repo: discover + write instant-nav.rig.md       → rig-template.md
- [ ] A  RIG          production build with the testing API exposed            → below
- [ ] B  BASELINE     unlocked: the marker renders for the CI test user        → test-template.md
- [ ] C  RED          locked instant(): the shell does not commit              → test-template.md
- [ ] C-gate          VERIFY-RED: stop until the RED is trustworthy            → reference/red-test-robustness.md
- [ ] D  FIX          push each Suspense boundary down to the data it guards   → reference/patterns.md
- [ ]      D1 reuse the route's existing loading UI; do not hand-build skeletons
- [ ]      D2 the shell matches the real render at every breakpoint
- [ ] E  PARITY       the refactor changed only the instancy
- [ ] F  DIFFERENTIAL revert only the fix → RED; re-apply → GREEN              → reference/red-test-robustness.md
- [ ] G  REVIEW       PR checklist (below)
```

Phases B–C build the test; only the locked test from C ships.

---

## 0 — SETUP: discover this project's rig, once per repo

The principles in this skill are fixed; the infrastructure they run on is
yours. On first use in a repository, discover how the project builds, deploys,
authenticates, and tests — inspect the repository first, and ask the user only
what it cannot answer — then write the answers to a committed
`instant-nav.rig.md`. Every later run reads that file instead of
rediscovering. The six questions (BUILD / EXPOSE / RUN / TEST USER / DRIFT /
LOOP), the file template, and filled examples (Vercel previews, generic CI +
container, local-only) are in **`rig-template.md`**.

## A — RIG: a production build with the testing API exposed

Stand up the rig described by `instant-nav.rig.md`. Two invariants hold on
every platform:

1. **Never measure on `next dev`.** Its lock is unreliable for blocking routes
   and reports a false pass after ~5s. Not a valid RED or GREEN.
2. **The measured build must expose the testing API.** Otherwise `instant()`
   silently no-ops and the test passes vacuously (see
   `reference/red-test-robustness.md`). Wire
   `experimental.exposeTestingApiInProductionBuild` to a condition that is
   true for every build you measure and never true in production:

   ```ts
   experimental: {
     // Use the condition your platform provides — record it in the rig file:
     //   Vercel:      process.env.VERCEL_ENV === 'preview'
     //   generic CI:  your preview/staging environment variable
     //   local:       an explicit opt-in, as below
     exposeTestingApiInProductionBuild:
       process.env.EXPOSE_TESTING_API === '1',
   }
   ```

The best rig is whatever production-like build your CI already produces on
every push — a Vercel preview, a staging container, a build artifact. It has
the real environment, and it closes the loop an unattended agent can drive:
push, wait for the build, run the test, read the failure, fix, push again.
Without CI, the loop is local and equally trustworthy: `next build && next
start` with the flag set. The verdict comes from the production build, not the
platform.

One caveat for the CI loop: confirm the build under test is live before
trusting a verdict — a test run against the previous deployment reads as a
false RED or a false GREEN. Poll the deployment for a marker from the latest
commit; do not race the rebuild.

## B — BASELINE (unlocked) — development scaffold, do not ship

Drive the real navigation with no `instant()` lock and assert that the
destination's `SHELL_MARKER` renders **as the CI test user** — their flags,
plan, role, and data. This establishes that the marker is real and reachable: not
flag-gated, not redirected away, not a guessed selector. The test runs as
someone who is not you, with state that is not yours; that drift (the DRIFT
list in the rig file) is where most untrustworthy REDs come from. Scaffold and
run command: **`test-template.md`**. **Delete this baseline before the PR.**

## C — RED (locked) + the VERIFY-RED gate

Wrap the same navigation in `instant()`; assert the shell commits under the
lock. A RED here is the gap. **This is the test that ships**
(`test-template.md`).

> **Gate C — do not start optimizing until the RED is verified trustworthy.** A
> RED that is red for the wrong reason sends you optimizing a route that was
> never broken — the most expensive mistake in this work.

The question that settles it: **does `SHELL_MARKER` render without the lock,
as the CI test user?**

- **No** — this is a marker or environment bug (flag-gated redirect, guessed
  selector, empty state, or a marker that is itself streamed). Fix the marker,
  not the route. Answer by re-running phase B as the CI test user, not by
  adding assertions to the shipped test.
- **Yes** — the marker is real and reachable; a RED under the lock is a
  genuine gap. Proceed to D.

The full taxonomy of untrustworthy REDs, the checklist, and worked cases are
in **`reference/red-test-robustness.md`**. Read it now.

---

## D — FIX: push each boundary down to the data it guards

**The anti-pattern: one coarse boundary.** A single `<Suspense>` high in the
tree with a page-level fallback has three costs. The layout UI stays out of
the static shell — only a throwaway copy of it is prerendered. The entire
subtree is replaced when the boundary resolves, discarding client state and
shifting layout. And the hand-built fallback drifts out of sync as the UI
changes, because it duplicates structure that also exists in the resolved
tree.

**The fix: hoist the static, push the Suspense down.** Render the layout UI
once, synchronously, in the shell, and wrap each await in a boundary scoped to
the single read it guards. Only that leaf streams; the stable ancestors are
reused as-is. The tree itself defines the loading state — there is no separate
page-level skeleton to keep in sync.

**Rule:** if an element renders in both the fallback and the resolved tree,
hoist it above the boundary.

### The most common blocker: a top-level `await` in a layout on a fallback route

```
app/[locale]/(app)/[tenant]/dashboard/...
       │ generateStaticParams ✅   │ no generateStaticParams → fallback route
```

When any dynamic segment in the route lacks `generateStaticParams`, the route
is a fallback route, and **all** params defer to request time — including the
enumerated ones. A top-level `await` in a layout (`await params`,
`await getServerSession()`, an auth gate) then blocks the whole subtree out of
the static shell, even when it reads a statically known param. Minimal
reproduction: `github.com/gaojude/next-instant-blocking-repro`.

### The fix: defer the gate, render children

Render `children` unconditionally; move the top-level `await` into a
`<Suspense>`-wrapped child. The shell prerenders as if authorized; the
deferred read suspends during prerender, so a `redirect()` only fires at
request time (`reference/real-app-patterns.md`, "Deferring an auth gate").

```tsx
// ❌ Before — blocks the whole subtree out of the shell
export default async function Layout({ children, params }) {
  await requireUser(params);
  return <Shell>{children}</Shell>;
}

// ✅ After — the layout is in the shell; the gate streams
import { Suspense } from "react";
export default function Layout({ children, params }) {
  return (
    <Shell>
      <Suspense fallback={null}>
        <RequireUserGate params={params} />
      </Suspense>
      {children}
    </Shell>
  );
}
async function RequireUserGate({ params }) {
  await requireUser(params);
  return null;
}
```

The page that consumes the shell should be sync (no top-level `await`), with
its dynamic data behind `<Suspense>`. `fallback={null}` is correct only when
the gate renders nothing on success. For data, the fallback must be a real
loading skeleton — see D1. The before→after recipe for every other blocker
(`cookies()`/`headers()`, uncached fetch or database reads, dynamic params,
`searchParams`, metadata) is in `reference/patterns.md`.

### D1 — reuse the route's existing loading UI; do not hand-build skeletons

Before writing any skeleton, search the repository for the loading UI that
already exists for this route, in order:

1. the route's `loading.tsx`;
2. an exported `*Skeleton` colocated with the component;
3. the fallback already inside the component's own `<Suspense>`.

If a component has no skeleton, extract its loading markup into a colocated
skeleton beside it. Do not author a fresh skeleton that mirrors the page
layout: it duplicates structure, drifts as the page changes, and pulls the
design back toward a single coarse boundary. Reusing the component's own
skeleton also keeps the prefetched shell consistent with the loaded UI.

Exception: if the deferred component renders `null` for some users (for
example, a flag-gated control), `fallback={null}` is correct — a skeleton
would flash and then collapse.

### D2 — the shell must match the real render at every breakpoint

A hand-built skeleton encodes one layout. The real UI is responsive, so a
skeleton frozen to the desktop layout misaligns on mobile.

The reliable fix is the same push-down: share the real responsive layout
between the live render and the shell render. One responsive component renders
both — its data slots show the reused skeleton (D1) in the shell and real data
after the stream — so the breakpoint switch happens once, for both, and there
is no second desktop-only skeleton to drift. Verify the shell against the real
render at desktop and mobile widths before calling it done.

## E — PARITY: the refactor changed only the instancy

The push-down is a mechanical transform, not a redesign. Afterward the route
must render the same tree, data, ordering, empty and error states, redirects,
and interactions as before — the only observable difference is that the shell
now commits instantly. Verify:

- **Same render output.** The moved `await`s compute and return the same
  values; after the stream, the route shows the same content as the base
  branch for the test user.
- **Side effects still fire.** A deferred `redirect()` or `notFound()` still
  happens — at request time rather than during prerender. Confirm an
  unauthorized user is still redirected and a missing record still returns 404.
- **Both viewports reach the real UI** after the stream (D2).
- **Client state survives.** Because the layout UI is hoisted into the stable
  shell rather than swapped on resolve, open menus, scroll position, focus,
  and input state persist across the stream.

If anything other than the instancy changed, reduce the refactor.

## F — DIFFERENTIAL

The strongest evidence that the test measures the property: revert only the fix →
RED; re-apply → GREEN; confirm nothing else moves it. Link both runs in the
PR. Recipe: `reference/red-test-robustness.md`.

## G — REVIEW (PR checklist)

A green final state means nothing if the RED was never trustworthy. Require:

- [ ] **Differential shown** — RED without the fix, GREEN with it, runs
      linked.
- [ ] **Marker is a sync static-shell node** (`data-testid`) — not streamed
      data, not a guessed `role`/`name`.
- [ ] **Marker renders for the CI test user** — not gated by a flag, plan, or
      role that user lacks; the route does not redirect that user away.
- [ ] **Measured on a production build**, never `next dev`, and against the
      build under test (not a stale deployment —
      `reference/red-test-robustness.md`).
- [ ] **Marker is visible** — not `display:none` or off-screen; for lists,
      target `.filter({ visible: true }).first()`.
- [ ] **Parity confirmed (E)** — same content, redirects, and state.
- [ ] **Existing loading UI reused (D1)** — no new page-mirroring skeleton.
- [ ] **Shell matches the real render at desktop and mobile widths (D2)**.

## Driving the navigation in tests

- For a **soft navigation** verdict, drive a real `<Link>` click. Do not use
  `page.goto()` inside `instant()` for this — `goto` is an initial load, and
  its shell can differ when a parent layout above the shared boundary awaits
  un-enumerated params (`reference/real-app-patterns.md`).
- For an **initial load** verdict, use `page.goto()` inside `instant()` with
  the `baseURL` option (`test-template.md`).
- With parallel routes, only the slots that change re-render on a soft
  navigation; client-rendered navigation UI does not re-render at all. Do not
  chase a slot the navigation never touches
  (`reference/real-app-patterns.md`).

## Files

- `rig-template.md` — phase 0: the six-question rig discovery, the
  `instant-nav.rig.md` template, and filled examples (Vercel, generic CI,
  local-only).
- `test-template.md` — the shipped `instant()` specs for both navigation
  types (phase C), and the delete-before-PR baseline scaffold (phase B).
- `reference/red-test-robustness.md` — gate C and phase F: the taxonomy of
  untrustworthy REDs, the checklist, the differential recipe, the vacuous-pass
  failure mode, and worked cases.
- `reference/patterns.md` — before→after fix recipe for each blocker type
  (top-level `await`, `cookies()`/`headers()`, uncached fetch or database
  reads, dynamic params, `searchParams`, metadata).
- `reference/real-app-patterns.md` — parallel routes, deferring an auth gate,
  initial-load vs soft-navigation shells, the blank-shell trap, the
  responsive-skeleton trap, edge cases.
