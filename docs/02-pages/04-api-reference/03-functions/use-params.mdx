---
title: useParams
description: API Reference for the useParams hook in the Pages Router.
---

`useParams` is a hook that lets you read a route's [dynamic params](/docs/pages/building-your-application/routing/dynamic-routes) filled in by the current URL.

```tsx filename="pages/shop/[slug].tsx" switcher
import { useParams } from 'next/navigation'

export default function ShopPage() {
  const params = useParams<{ slug: string }>()

  if (!params) {
    // Render fallback UI while params are not yet available
    return null
  }

  // Route -> /shop/[slug]
  // URL -> /shop/shoes
  // `params` -> { slug: 'shoes' }
  return <>Shop: {params.slug}</>
}
```

```jsx filename="pages/shop/[slug].js" switcher
import { useParams } from 'next/navigation'

export default function ShopPage() {
  const params = useParams()

  if (!params) {
    // Render fallback UI while params are not yet available
    return null
  }

  // Route -> /shop/[slug]
  // URL -> /shop/shoes
  // `params` -> { slug: 'shoes' }
  return <>Shop: {params.slug}</>
}
```

## Parameters

```tsx
const params = useParams()
```

`useParams` does not take any parameters.

## Returns

`useParams` returns an object containing the current route's filled in [dynamic parameters](/docs/pages/building-your-application/routing/dynamic-routes), or `null` during [pre-rendering](#behavior-during-pre-rendering).

- Each property in the object is an active dynamic segment.
- The property name is the segment's name, and the property value is what the segment is filled in with.
- The property value will either be a `string` or array of `string`s depending on the [type of dynamic segment](/docs/pages/building-your-application/routing/dynamic-routes).
- If the route contains no dynamic parameters, `useParams` returns an empty object.

For example:

| Route                        | URL         | `useParams()`             |
| ---------------------------- | ----------- | ------------------------- |
| `pages/shop/page.js`         | `/shop`     | `{}`                      |
| `pages/shop/[slug].js`       | `/shop/1`   | `{ slug: '1' }`           |
| `pages/shop/[tag]/[item].js` | `/shop/1/2` | `{ tag: '1', item: '2' }` |
| `pages/shop/[...slug].js`    | `/shop/1/2` | `{ slug: ['1', '2'] }`    |

> **Good to know**: `useParams` is a [React Hook](https://react.dev/learn#using-hooks) and cannot be used with classes.

## Behavior

### Behavior during pre-rendering

For pages that are [statically optimized](/docs/pages/building-your-application/rendering/automatic-static-optimization), `useParams` will return `null` on the initial render. After hydration, the value will be updated to the actual params once the router is ready.

This is because params cannot be known during static generation for dynamic routes.

```tsx filename="pages/shop/[slug].tsx" switcher
import { useParams } from 'next/navigation'

export default function ShopPage() {
  const params = useParams<{ slug: string }>()

  if (!params) {
    // Return a fallback UI while params are loading
    // This prevents hydration mismatches
    return <ShopPageSkeleton />
  }

  return <>Shop: {params.slug}</>
}
```

```jsx filename="pages/shop/[slug].js" switcher
import { useParams } from 'next/navigation'

export default function ShopPage() {
  const params = useParams()

  if (!params) {
    // Return a fallback UI while params are loading
    // This prevents hydration mismatches
    return <ShopPageSkeleton />
  }

  return <>Shop: {params.slug}</>
}
```

### Using with `getServerSideProps`

When using [`getServerSideProps`](/docs/pages/building-your-application/data-fetching/get-server-side-props), the page is server-rendered on each request and `useParams` will return the actual params immediately:

```tsx filename="pages/shop/[slug].tsx" switcher
import { useParams } from 'next/navigation'

export default function ShopPage() {
  const params = useParams<{ slug: string }>()

  // With getServerSideProps, this fallback is never rendered because
  // params is always available on the server. However, keeping
  // the fallback allows this component to be reused on other pages
  // that may not use getServerSideProps.
  if (!params) {
    return null
  }

  return <>Shop: {params.slug}</>
}

export async function getServerSideProps() {
  return { props: {} }
}
```

```jsx filename="pages/shop/[slug].js" switcher
import { useParams } from 'next/navigation'

export default function ShopPage() {
  const params = useParams()

  // With getServerSideProps, this fallback is never rendered because
  // params is always available on the server. However, keeping
  // the fallback allows this component to be reused on other pages
  // that may not use getServerSideProps.
  if (!params) {
    return null
  }

  return <>Shop: {params.slug}</>
}

export async function getServerSideProps() {
  return { props: {} }
}
```

### Comparison with `router.query`

`useParams` only returns the dynamic route parameters, whereas [`router.query`](/docs/pages/api-reference/functions/use-router#router-object) from `useRouter` includes both dynamic parameters and query string parameters.

```tsx filename="pages/shop/[slug].tsx" switcher
import { useRouter } from 'next/router'
import { useParams } from 'next/navigation'

export default function ShopPage() {
  const router = useRouter()
  const params = useParams()

  // URL -> /shop/shoes?color=red

  // router.query -> { slug: 'shoes', color: 'red' }
  // params -> { slug: 'shoes' }

  // ...
}
```

```jsx filename="pages/shop/[slug].js" switcher
import { useRouter } from 'next/router'
import { useParams } from 'next/navigation'

export default function ShopPage() {
  const router = useRouter()
  const params = useParams()

  // URL -> /shop/shoes?color=red

  // router.query -> { slug: 'shoes', color: 'red' }
  // params -> { slug: 'shoes' }

  // ...
}
```

## Examples

### Sharing components with App Router

`useParams` from `next/navigation` works in both the Pages Router and App Router. This allows you to create shared components that work in either context:

```tsx filename="components/breadcrumb.tsx" switcher
import { useParams } from 'next/navigation'

// This component works in both pages/ and app/
export function Breadcrumb() {
  const params = useParams<{ slug: string }>()

  if (!params) {
    // Fallback for Pages Router during pre-rendering
    return <nav>Home / ...</nav>
  }

  return <nav>Home / {params.slug}</nav>
}
```

```jsx filename="components/breadcrumb.js" switcher
import { useParams } from 'next/navigation'

// This component works in both pages/ and app/
export function Breadcrumb() {
  const params = useParams()

  if (!params) {
    // Fallback for Pages Router during pre-rendering
    return <nav>Home / ...</nav>
  }

  return <nav>Home / {params.slug}</nav>
}
```

> **Good to know**: When using this component in the App Router, `useParams` never returns `null`, so the fallback branch will not be rendered.

## Version History

| Version   | Changes                 |
| --------- | ----------------------- |
| `v13.3.0` | `useParams` introduced. |
