# React And Suspense Composition

Use this before changing layouts, providers, fallbacks, route groups, or data ownership for an Instant route.

## Core Model

Suspense is a composition boundary, not a loading flag. A child suspends because it naturally reads async, request, runtime, or uncached data. Do not teach components that they are in an Instant shell.

Prefer:

```tsx
<StablePageFrame>
  <Suspense fallback={<ContentPlaceholder />}>
    <DatafulContent />
  </Suspense>
</StablePageFrame>
```

Avoid:

```tsx
<Suspense fallback={<FakeWholePage />}>
  <WholePageThatOwnsStableFrameAndData />
</Suspense>
```

## Ownership Rules

- Put stable layout above the smallest dataful boundary.
- Let the route/layout that owns the visible shell own the fallback.
- A list/data boundary fallback should render list/data placeholders only; it should not recreate app-level shared layout.
- A child data boundary should not know whether it is in an Instant shell.
- If a public URL rewrites through a generic owner that cannot know the shell shape, change ownership or split the stable frame so the lower owner captures first.

## Provider Rules

- Provider placement is architecture. Providers that unwrap session, flags, params, cookies, headers, or request promises above the route block the shell before useful fallbacks render.
- Split providers into stable shape/defaults that render immediately, plus dataful children that suspend locally.
- A fallback rendering only inert primitives does not need the full provider stack.
- A fallback rendering real children or client components using app hooks must sit under the same providers as the loaded UI, or stop rendering those children.
- When introducing a pending provider, audit shared client controls that call `useUser()`, `useFlags()`, `useSearchParams()`, or session hooks. A provider fix can make those reads surface as build-only `blocking-route` failures on routes outside the current slice. Wrap each control in a local Suspense boundary with an inert fallback instead of dragging a larger shell rewrite into the provider PR.

### Pending Provider Pattern

Sometimes the truthful shell needs provider shape but not resolved provider data:

```tsx
function UserProvider({ children, userPromise }: Props) {
  return (
    <Suspense fallback={<PendingUserProvider>{children}</PendingUserProvider>}>
      <ResolvedUserProvider userPromise={userPromise}>
        {children}
      </ResolvedUserProvider>
    </Suspense>
  )
}
```

The fallback provider must expose a shape consumers can safely read, and dataful consumers should still reveal under their own boundaries. Do not use pending defaults to pretend personalized data is loaded.

Be careful: rendering the same children under pending and resolved providers can run client effects twice or let consumers briefly observe default values. Keep side effects and personalized reads below resolved/dataful boundaries.

### Known Route Defaults

If a route owner statically knows a value needed for shell shape, pass it directly instead of suspending on a higher-level runtime read. For generated root variant identity, use `next/root-params` getters; do not thread root values through `props.params`, and do not move reads into a root document layout just to get at generated params.

Do not use this as a license to hardcode request-derived state. If a value can differ for the same internal route owner, keep only the shared frame above Suspense and suspend the state-specific region.

## Locale And Translations

Treat locale as part of shell identity when visible shell text is localized. The loaded UI should use the real variant locale. A fallback may use the default locale only when the pending shell is inert, internal-only, or explicitly allowed to show one locale until real content resolves.

Prefer:

- make locale a route-owned/static variant input,
- pass the route-known locale when the segment already owns it,
- move locale-dependent loaded text below a route-owned Suspense boundary,
- render generic non-localized skeleton shapes in the fallback.

For function-valued translation keys, missing-provider or missing-key fallbacks can turn a function into a string and crash at call time. If `t('some.key')(...)` fails, check the locale provider and locale data before moving boundaries.

## Shared Frames

Avoid fallback drift by extracting stable loaded primitives:

```tsx
<SidebarFrame>
  <Suspense fallback={<SidebarNavPlaceholder />}>
    <SidebarNav />
  </Suspense>
</SidebarFrame>
```

Good shared primitives: header/logo frame, sidebar frame, collapse-button space reservation, app/card frame, page title/control frame, grid/list shell, first-card dimensions. Extract constants/config for labels, icons, ordering, and sizes so fallback and loaded UI cannot drift.

For shared layout that must stay resolved across client navigation, keep the shared frame mounted as a stable layout-owned client component. Passing a fresh server `defaultSlot` through a client router can still remount the subtree and show its own skeleton while the shell is captured.

## Standalone Route Frames

Utility, auth-handoff, internal, and redirect routes often have a small stable frame plus request-specific work. If several routes in the same group fail Instant or build validation, create a shared standalone frame at the layout level:

```tsx
export function StandaloneRouteFrame({
  children,
}: {
  children: React.ReactNode
}) {
  return <Suspense fallback={<StandaloneRouteFallback />}>{children}</Suspense>
}
```

The fallback should be generic, inert, and honest. If the route immediately redirects or has no visible pending UI, `fallback={null}` or `instant: false` may be more truthful.

## Fallback Legitimacy Checklist

Before accepting a fallback:

- Renders under the providers and adapters required by any active children.
- Avoids live client hooks, routing behavior, query mutation, and personalized actions.
- Reserves stable layout space for persistent shared layout and the first meaningful content region.
- Represents only route-known facts.
- Does not render multiple candidate route/auth shells.
- Shares loaded frame primitives where labels, icons, spacing, or dimensions would otherwise drift.
- Has a route-owner marker or captured-shell DOM evidence that proves this boundary was captured.

## When Null Fallbacks Are Appropriate

`Suspense fallback={null}` is appropriate when the suspended work has no visible layout contract and absence is the correct pending state:

- telemetry, analytics, or optional background helpers
- modals, drawers, popovers, or portals closed by default
- redirect or auth handoff helpers that should not flash UI
- metadata, preconnect, warming, or non-visible style helpers

Use this rule:

```text
If the user would notice the region missing while the shell is captured, do not use null.
If children below the boundary are supposed to produce the route shell, do not use null.
If the only correct pending state is absence, null is fine.
```

For shared layouts, prefer an inert frame fallback over null when loaded UI will later occupy stable layout space. For leaf controls, prefer a disabled or skeleton twin when the control box affects alignment.

## Client And Runtime Data

Move these below local Suspense boundaries when they affect visible UI:

- `useSearchParams()`
- router/query-state hooks
- SWR suspense hooks
- user/session/account hooks
- feature flags and preferences
- uncached fetches
- async params/search params
- request-bound cookies/headers

For client controls that read search params or router state, build a small inert twin that preserves the box model:

```tsx
<Suspense fallback={<SearchInputFallback disabled />}>
  <SearchInput />
</Suspense>
```

The fallback should share the same outer element, size, padding, placeholder shape, and any data hooks tests rely on. If the control's default visible state depends on the URL, the inert twin must either match the URL-independent shell shape or move lower under a route-specific owner. Do not parse the pathname in the fallback just to pick a visual state.

## Migration Recipe

For an existing route with mixed shell, data, providers, and query controls:

1. Prove the route works in its normal loaded state.
2. Map visible URL to internal route owner.
3. Add a route-owned marker for the intended shell.
4. Extract stable frame primitives from the loaded UI.
5. Move request, params, query, user, flag, and uncached reads below local Suspense boundaries.
6. Add inert fallbacks for client controls and data regions.
7. Keep provider shape available, but do not expose resolved facts until they are real.
8. Delete fake whole-page shells and duplicate candidate route/auth DOM.
9. Add layout-dimension assertions for persistent shared layout, route title, primary frame, and first content region.
10. Run the full state matrix; update screenshots only after diagnostics and layout dimensions are clean.
