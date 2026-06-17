---
title: useParams
description: API Reference for the useParams hook.
---

`useParams` is a **Client Component** hook that lets you read a route's [dynamic params](/docs/app/api-reference/file-conventions/dynamic-routes) filled in by the current URL.

```tsx filename="app/example-client-component.tsx" switcher
'use client'

import { useParams } from 'next/navigation'

export default function ExampleClientComponent() {
  const params = useParams<{ tag: string; item: string }>()

  // Route -> /shop/[tag]/[item]
  // URL -> /shop/shoes/nike-air-max-97
  // `params` -> { tag: 'shoes', item: 'nike-air-max-97' }
  console.log(params)

  return '...'
}
```

```jsx filename="app/example-client-component.js" switcher
'use client'

import { useParams } from 'next/navigation'

export default function ExampleClientComponent() {
  const params = useParams()

  // Route -> /shop/[tag]/[item]
  // URL -> /shop/shoes/nike-air-max-97
  // `params` -> { tag: 'shoes', item: 'nike-air-max-97' }
  console.log(params)

  return '...'
}
```

## Parameters

```tsx
const params = useParams()
```

`useParams` does not take any parameters.

## Returns

`useParams` returns an object containing the current route's filled in [dynamic parameters](/docs/app/api-reference/file-conventions/dynamic-routes).

- Each property in the object is an active dynamic segment.
- The properties name is the segment's name, and the properties value is what the segment is filled in with.
- The properties value will either be a `string` or array of `string`'s depending on the [type of dynamic segment](/docs/app/api-reference/file-conventions/dynamic-routes).
- If the route contains no dynamic parameters, `useParams` returns an empty object.
- If used in Pages Router, `useParams` will return `null` on the initial render and updates with properties following the rules above once the router is ready.

For example:

| Route                           | URL         | `useParams()`             |
| ------------------------------- | ----------- | ------------------------- |
| `app/shop/page.js`              | `/shop`     | `{}`                      |
| `app/shop/[slug]/page.js`       | `/shop/1`   | `{ slug: '1' }`           |
| `app/shop/[tag]/[item]/page.js` | `/shop/1/2` | `{ tag: '1', item: '2' }` |
| `app/shop/[...slug]/page.js`    | `/shop/1/2` | `{ slug: ['1', '2'] }`    |

## Behavior

### Cache Components

When [`cacheComponents`](/docs/app/api-reference/config/next-config-js/cacheComponents) is enabled, `useParams` may require a [`Suspense`](https://react.dev/reference/react/Suspense) boundary. This depends on whether the params can be resolved during prerendering.

- **Static routes and routes with [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params)**: every dynamic param is known at build time. `useParams` resolves on the server and no `Suspense` boundary is required.
- **Routes with dynamic params not covered by `generateStaticParams`**: the param is not known until request time. `useParams` suspends. Wrap the component (or a parent) in a `Suspense` boundary so its fallback can be rendered during prerendering; otherwise, the build fails.

See [Next.js encountered URL data in a Client Component outside of Suspense](/docs/messages/blocking-prerender-client-hook) for full fix options and trade-offs.

## Version History

| Version   | Changes                 |
| --------- | ----------------------- |
| `v13.3.0` | `useParams` introduced. |
