---
title: turbopackLazyDynamicImportsSSR
description: Compile dynamic imports when server rendering first reaches them during development.
version: experimental
related:
  links:
    - app/api-reference/config/next-config-js/turbopackLazyDynamicImports
---

The `experimental.turbopackLazyDynamicImportsSSR` option defers compiling dynamic imports until server rendering first reaches them during `next dev`.

```ts filename="next.config.ts" switcher highlight={5}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackLazyDynamicImportsSSR: true,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher highlight={4}
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackLazyDynamicImportsSSR: true,
  },
}

module.exports = nextConfig
```

## How it works

Client Components can use [`lazy`](https://react.dev/reference/react/lazy) to load a component dynamically. With `turbopackLazyDynamicImportsSSR` enabled, Turbopack compiles the imported component when a server render first reaches it. A target that is not rendered remains uncompiled.

In the following example, Turbopack compiles `Preview` when `showPreview` is `true` during server rendering:

```tsx filename="app/preview.tsx" switcher
'use client'

import { lazy } from 'react'

const Preview = lazy(() => import('./preview-panel'))

export function MaybePreview({ showPreview }: { showPreview: boolean }) {
  return showPreview ? <Preview /> : null
}
```

```jsx filename="app/preview.js" switcher
'use client'

import { lazy } from 'react'

const Preview = lazy(() => import('./preview-panel'))

export function MaybePreview({ showPreview }) {
  return showPreview ? <Preview /> : null
}
```

> **Good to know:**
>
> - The option defaults to `false` and only affects the Node.js runtime with Turbopack during `next dev`. It does not change production builds.
> - To defer client-side dynamic imports until the browser requests them, use [`turbopackLazyDynamicImports`](/docs/app/api-reference/config/next-config-js/turbopackLazyDynamicImports).

## Version History

| Version   | Changes                                                                   |
| --------- | ------------------------------------------------------------------------- |
| `v16.4.0` | `experimental.turbopackLazyDynamicImportsSSR` configuration option added. |
