---
title: connection
description: API Reference for the connection function.
---

The `connection()` function allows you to indicate rendering should wait for an incoming user request before continuing.

It's useful when a component doesn’t use [Dynamic APIs](/docs/app/getting-started/partial-prerendering#dynamic-rendering), but you want it to be dynamically rendered at runtime and not statically rendered at build time. This usually occurs when you access external information that you intentionally want to change the result of a render, such as `Math.random()` or `new Date()`.

```ts filename="app/page.tsx" switcher
import { connection } from 'next/server'

export default async function Page() {
  await connection()
  // Everything below will be excluded from prerendering
  const rand = Math.random()
  return <span>{rand}</span>
}
```

```jsx filename="app/page.js" switcher
import { connection } from 'next/server'

export default async function Page() {
  await connection()
  // Everything below will be excluded from prerendering
  const rand = Math.random()
  return <span>{rand}</span>
}
```

## Reference

### Type

```jsx
function connection(): Promise<void>
```

### Parameters

- The function does not accept any parameters.

### Returns

- The function returns a `void` Promise. It is not meant to be consumed.

## Good to know

- `connection` replaces [`unstable_noStore`](/docs/app/api-reference/functions/unstable_noStore) to better align with the future of Next.js.
- The function is only necessary when dynamic rendering is required and common Dynamic APIs are not used.

### Version History

| Version      | Changes                  |
| ------------ | ------------------------ |
| `v15.0.0`    | `connection` stabilized. |
| `v15.0.0-RC` | `connection` introduced. |
