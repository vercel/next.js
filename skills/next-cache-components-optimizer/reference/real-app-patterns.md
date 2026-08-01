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

See: [Parallel Routes](https://nextjs.org/docs/app/api-reference/file-conventions/parallel-routes)
and [what instant means](https://nextjs.org/docs/app/guides/instant-navigation#what-instant-means).

## Confirm which slots the navigation changes

Parallel and intercepted routes can make the changed segment set difficult to
infer from the filesystem. Use `test-template.md` to drive the real link
interaction, then optimize only the slots that participate in that navigation.

## "Instant" is not "useful shell": the empty-shell failure mode

Validation checks that a dynamic read is **guarded by a boundary**, not that the fallback is non-empty. A `<Suspense>` with no `fallback` (or `fallback={null}`) passes validation and commits instantly, but renders a **blank** shell. If a layout and its page both `await getSession()` (your auth library's request-time read) at the top under one empty-fallback boundary, the whole frame collapses to nothing while the user waits. "Validates as instant" and "good loading experience" are different goals.

Use meaningful loading UI for visual data regions and place boundaries low so
more real content stays in the shell. Keep `fallback={null}` only when the
deferred component intentionally has no visual output.

See: [Iterate on loading states](https://nextjs.org/docs/app/guides/instant-navigation#iterate-on-loading-states).

## The responsive-skeleton mismatch: the shell must match every breakpoint

A loading skeleton that misaligns with the loaded UI is its own bug, and it usually appears on mobile. A hand-built skeleton encodes one layout; the real component is responsive and changes shape at breakpoints, so a desktop-shaped skeleton no longer lines up once the viewport is small.

A concrete shape: a list-detail view renders a list or tree in a side panel on desktop, but collapses that panel into a single dropdown or drawer on mobile (with its own loading state). A row skeleton built for the desktop panel has nothing to align with on mobile.

The fix is the same push-down as everywhere else: **share the real responsive layout between the live render and the shell render.** One responsive component renders both (its data slots show the reused `*Skeleton` in the shell and real data after the stream), so the breakpoint switch happens once, for both renders, and there is no second desktop-only skeleton to drift.

(Same hoist rule, responsive layout included.) Verify the shell at both desktop and mobile widths against the real render at the same width.

See: [`loading.tsx`](https://nextjs.org/docs/app/api-reference/file-conventions/loading).

## Authorization gates: preserve the security boundary

Authorization belongs close to
the data source, commonly in a Data Access Layer, and Server Actions need their
own checks.

Isolate presentation reads such as a user menu. Do not render protected
children unconditionally merely to grow the shell. If authorization genuinely
controls the whole subtree and no safe public shell exists, use the insight's
blocking-route option and record that product/security decision.

See: [Authorization](https://nextjs.org/docs/app/guides/authentication#authorization)
and [runtime data](https://nextjs.org/docs/messages/blocking-prerender-runtime).

## Initial-load shell vs soft-navigation shell

The `test-template.md` specs drive a `<Link>` click for soft navigations and
`page.goto()` for initial loads. The two shells can differ for the same route:

> **The initial-load shell can show less than the soft-navigation shell when a layout above the shared boundary awaits un-enumerated `params`/`searchParams`.** An initial load re-runs every layout from the root; if a parent layout does `await props.params` and that segment has no `generateStaticParams`, the param suspends on the initial load and its whole subtree drops out of the shell. A soft navigation does not re-render that parent and already has the params. Symptom: an element present after a `<Link>` click is missing after `goto`.

To assert the soft-navigation shell, drive a real `<Link>` click (through menus if necessary). Use `page.goto()` inside `instant()` to assert the initial-load shell, or when no parent above the shared boundary awaits un-enumerated params, in which case the two coincide. Test shape: `test-template.md`.

See: [What instant means](https://nextjs.org/docs/app/guides/instant-navigation#what-instant-means).

## Edge cases

- **A memoization wrapper does not change a runtime read into static data.**
  Use the [runtime-data insight](https://nextjs.org/docs/messages/blocking-prerender-runtime)
  for `cookies()` or `headers()` rather than treating memoization as the fix.
- **Visibility assertions need a visible element.** Playwright's
  [visibility definition](https://playwright.dev/docs/actionability#visible)
  excludes elements without a rendered box. Give a fragment or
  `display: contents` fallback a real wrapper and stable `data-testid` when it
  is the shell marker.
