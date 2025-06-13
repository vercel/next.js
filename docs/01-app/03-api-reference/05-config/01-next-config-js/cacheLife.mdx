---
title: cacheLife
description: Learn how to set up cacheLife configurations in Next.js.
version: canary
---

The `cacheLife` option allows you to define **custom cache profiles** when using the [`cacheLife`](/docs/app/api-reference/functions/cacheLife) function inside components or functions, and within the scope of the [`use cache` directive](/docs/app/api-reference/directives/use-cache).

## Usage

To define a profile, enable the [`dynamicIO` flag](/docs/app/api-reference/config/next-config-js/dynamicIO) and add the cache profile in the `cacheLife` object in the `next.config.js` file. For example, a `blog` profile:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    dynamicIO: true,
    cacheLife: {
      blog: {
        stale: 3600, // 1 hour
        revalidate: 900, // 15 minutes
        expire: 86400, // 1 day
      },
    },
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
module.exports = {
  experimental: {
    dynamicIO: true,
    cacheLife: {
      blog: {
        stale: 3600, // 1 hour
        revalidate: 900, // 15 minutes
        expire: 86400, // 1 day
      },
    },
  },
}
```

You can now use this custom `blog` configuration in your component or function as follows:

```tsx filename="app/actions.ts" highlight={4,5} switcher
import { unstable_cacheLife as cacheLife } from 'next/cache'

export async function getCachedData() {
  'use cache'
  cacheLife('blog')
  const data = await fetch('/api/data')
  return data
}
```

```jsx filename="app/actions.js" highlight={4,5} switcher
import { unstable_cacheLife as cacheLife } from 'next/cache'

export async function getCachedData() {
  'use cache'
  cacheLife('blog')
  const data = await fetch('/api/data')
  return data
}
```

## Reference

The configuration object has key values with the following format:

| **Property** | **Value** | **Description**                                                                                           | **Requirement**                             |
| ------------ | --------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `stale`      | `number`  | Duration the client should cache a value without checking the server.                                     | Optional                                    |
| `revalidate` | `number`  | Frequency at which the cache should refresh on the server; stale values may be served while revalidating. | Optional                                    |
| `expire`     | `number`  | Maximum duration for which a value can remain stale before switching to dynamic.                          | Optional - Must be longer than `revalidate` |
