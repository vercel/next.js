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

The `unstable_instant` route segment config opts a route into validation for instant client-side navigations. Next.js checks, during development and at build time, that the caching structure produces an instant [static shell](/docs/app/glossary#static-shell) at every possible entry point into the route.

> **Good to know**:
>
> - The `unstable_instant` export only works when [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) is enabled.
> - `unstable_instant` cannot be used in Client Components. It will throw an error.

```tsx filename="layout.tsx | page.tsx" switcher
export const unstable_instant = {
  prefetch: 'static',
}

export default function Page() {
  return <div>...</div>
}
```

```jsx filename="layout.js | page.js" switcher
export const unstable_instant = {
  prefetch: 'static',
}

export default function Page() {
  return <div>...</div>
}
```

## Reference

### `prefetch`

Controls the validation and prefetching mode.

```tsx filename="page.tsx"
export const unstable_instant = {
  prefetch: 'static',
}
```

- **`'static'`**: Enables validation. Prefetching behavior stays the same (static by default). Components that read cookies or headers are treated as dynamic and must be behind Suspense.

### Disabling instant

Set `false` to exempt a segment from validation:

```tsx filename="app/dashboard/layout.tsx"
export const unstable_instant = false
```

## How validation works

`unstable_instant` triggers validation at every shared layout boundary in the route. Validation runs during development (on page loads and HMR updates) and at build time. Errors appear in the dev error overlay or fail the build.

Each error identifies the component that would block navigation. The fix is usually to cache the data with `use cache` or wrap it in a `<Suspense>` boundary.

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

The `@next/playwright` package exports an `instant()` helper that holds back dynamic content while the callback runs against the static shell. See the [guide](/docs/app/guides/instant-navigation#prevent-regressions-with-e2e-tests) for a full example.

```typescript
import { instant } from '@next/playwright'
```

{/* TODO: remove when fixed and from prod-docs-release */}

## Known issue: shared cookie across projects

The DevTools use a `next-instant-navigation-testing` cookie to freeze the UI at the static shell. Because cookies are scoped to the domain and not the port, running multiple projects on the same domain (typically `localhost`) means the cookie is shared across them and can cause unexpected behavior. Clear the cookie or close the Instant Navs panel when switching between projects to avoid issues.

> **Good to know:** This will be fixed as part of stabilizing the feature.

## TypeScript

```tsx
type RuntimeSample = {
  cookies?: Array<{ name: string; value: string }>
  headers?: Array<[string, string]>
  params?: Record<string, string | string[]>
  searchParams?: Record<string, string | string[]>
}

type InstantConfig =
  | false
  | {
      prefetch: 'static'
      from?: string[]
      unstable_disableValidation?: boolean
    }
  | {
      prefetch: 'runtime'
      samples: RuntimeSample[]
      from?: string[]
      unstable_disableValidation?: boolean
    }

export const unstable_instant: InstantConfig = {
  prefetch: 'static',
}
```

## Version History

| Version   | Changes                                                      |
| --------- | ------------------------------------------------------------ |
| `v16.x.x` | `unstable_instant` export introduced (Cache Components only) |
