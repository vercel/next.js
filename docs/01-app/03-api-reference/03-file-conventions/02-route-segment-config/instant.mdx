---
title: instant
description: API reference for the instant route segment config.
version: draft
related:
  title: Next Steps
  description: Learn how to use instant navigations in practice.
  links:
    - app/guides/instant-navigation
    - app/getting-started/caching
    - app/getting-started/revalidating
    - app/api-reference/directives/use-cache
---

The `unstable_instant` route segment config controls how Next.js validates whether a navigation into this segment would produce an instant UI.

Next.js uses prefetching to preload navigations for all in-app links on the current page. However, client-side data fetching or partially prerendered results from the server can lead to navigations that don't update the UI immediately. To help you build fast-feeling navigations, `unstable_instant` lets you tell Next.js what to expect from navigations through the configured segment. For instance, you can indicate that navigations into this segment should produce a UI that renders instantly without waiting on any externally loaded data. You can also indicate that navigations aren't expected to be instant.

When a segment is configured to expect an instant UI, Next.js surfaces any code in your application that would block the navigation from updating the UI immediately. See the [Instant Navigation guide](/docs/app/guides/instant-navigation) for an end-to-end walkthrough.

> **Good to know**:
>
> - The `unstable_instant` export only works when [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) is enabled.
> - `unstable_instant` cannot be used in Client Components. It will throw an error.
> - Next.js does not perform prefetches in development, so navigations may not feel as instant as they will in production. Validation reflects what will happen during `next start`, where prefetching is enabled.

```tsx filename="layout.tsx | page.tsx" switcher
export const unstable_instant = true

export default function Page() {
  return <div>...</div>
}
```

```jsx filename="layout.js | page.js" switcher
export const unstable_instant = true

export default function Page() {
  return <div>...</div>
}
```

## Reference

The export accepts:

- **`true`**: Opts the segment into validation at whatever level is configured globally (see [Configuring validation defaults](#configuring-validation-defaults)). With the framework defaults, validation runs in development only and surfaces errors in the dev overlay.
- **`false`**: Opts the segment out (see [Disabling instant](#disabling-instant)).
- An **object**: Opts in with additional options. See [`level`](#level).

### `level`

Sets the severity at which validation runs for this segment.

```tsx filename="page.tsx"
export const unstable_instant = {
  level: 'warning',
}
```

- **`'warning'`**: Validates in development only. Errors appear in the dev overlay; the build is unaffected.

In the future a validation level that supports validation during build will be supported. Unless you are enabling experimental validation modes there is no need to specify level since the only level available is `"warning"`.

When `level` is omitted (or `unstable_instant = true` is used), the segment is validated at whatever level is configured globally — see [Configuring validation defaults](#configuring-validation-defaults).

### Disabling instant

Set `false` on a layout or page to indicate that this segment is allowed to block when navigating to it.

This is useful when a deeper page should be instant but an ancestor can't be. For instance, if a shared layout cannot load instantly but you still want to assert that pages beneath this layout can be navigated to instantly, you can ensure that the pages have `unstable_instant = true` while the shared layout has `unstable_instant = false`.

```tsx filename="app/tabs/layout.tsx"
export const unstable_instant = false
```

```tsx filename="app/tabs/[tab]/page.tsx"
export const unstable_instant = true
```

Navigations from outside into a tab are allowed to block at the layout. Navigations between tabs are validated for instant UI.

You don't need to add `false` to ancestors of an instant page just because they do something blocking — a higher-up `unstable_instant = true` doesn't force its descendants to validate, and leaving an ancestor unconfigured is fine. Reach for `false` only when you've configured a deeper page as instant and need to exempt navigations that pass through a blocking ancestor.

### Disabling static shell validation

Cache Components also validates that each page in your app produces a non-empty static shell at prerender time. To opt a route out of this validation, ensure the highest `unstable_instant` config in the route's tree is `false` — a `false` higher in the tree takes precedence over any deeper `true` for the static-shell check.

Setting `false` on the root layout disables static shell validation for the entire app. Place the `false` as low as possible — only as high as needed to cover the routes you want to opt out — so the rest of the app keeps validating.

## How validation works

`unstable_instant` triggers validation at every shared layout boundary in the route. Validation runs during development (on page loads and HMR updates) and surfaces errors in the dev error overlay.

Each error identifies the component that would block navigation. The fix is usually to cache the data with `use cache` or wrap it in a `<Suspense>` boundary.

## Configuring validation defaults

By default, only segments that explicitly export `unstable_instant` are validated. The `experimental.instantInsights.validationLevel` config opts every Page and Default segment into validation at once, without needing to repeat `unstable_instant` on each route.

```js filename="next.config.js"
module.exports = {
  experimental: {
    instantInsights: {
      validationLevel: 'warning',
    },
  },
}
```

The supported levels are:

- **`'manual-warning'`** _(framework default)_: Only segments with an explicit `unstable_instant` are validated, at warning level (dev only).
- **`'warning'`**: Every Page and Default segment is implicitly validated at warning level (dev only).

Setting `unstable_instant = false` on a segment opts it out of validation entirely.

> **Good to know**:
>
> - The framework default may change in future versions to opt users into higher levels of validation. Because this feature is experimental, that change is not considered a breaking change. To pin a specific behavior, set `validationLevel` explicitly.
> - Framework-synthesized error routes (`/_global-error`, `/_not-found`) are excluded from implicit validation. To validate them, opt in explicitly with `unstable_instant`.

## Inspecting loading states

Enable the DevTools toggle with the experimental flag:

```js filename="next.config.js"
module.exports = {
  experimental: {
    instantNavigationDevToolsToggle: true,
  },
}
```

Open the Next.js DevTools and select **Instant Navs**. Two options are available:

- **Page load**: click **Reload** to refresh the page and freeze it at the initial static UI that was generated for this route, before any dynamic data streams in.
- **Client navigation**: once enabled, clicking any link in your app shows the prefetched UI for that page instead of the full result.

Use both to check that your loading states look right on first visit and on navigation.

## Testing instant navigation

The `@next/playwright` package exports an `instant()` helper that holds back dynamic content while the callback runs against the instant UI. See the [guide](/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) for a full example.

```typescript
import { instant } from '@next/playwright'
```

{/* TODO: remove when fixed and from prod-docs-release */}

## Known issue: shared cookie across projects

The DevTools use a `next-instant-navigation-testing` cookie to hold back dynamic content and freeze the page at the instant UI. Because cookies are scoped to the domain and not the port, running multiple projects on the same domain (typically `localhost`) means the cookie is shared across them and can cause unexpected behavior. Clear the cookie or close the Instant Navs panel when switching between projects to avoid issues.

> **Good to know:** This will be fixed as part of stabilizing the feature.

## TypeScript

```tsx
type InstantConfig =
  | true
  | false
  | {
      level?: 'warning'
    }

export const unstable_instant: InstantConfig = true
```

## Version History

| Version   | Changes                                                      |
| --------- | ------------------------------------------------------------ |
| `v16.x.x` | `unstable_instant` export introduced (Cache Components only) |
