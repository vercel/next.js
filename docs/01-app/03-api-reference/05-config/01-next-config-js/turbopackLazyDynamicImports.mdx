---
title: turbopackLazyDynamicImports
description: Compile client-side dynamic imports when they are first requested during development.
version: experimental
related:
  links:
    - app/api-reference/config/next-config-js/turbopackLazyDynamicImportsSSR
---

The `experimental.turbopackLazyDynamicImports` option defers compiling client-side dynamic `import()` targets until the browser first requests them during `next dev`.

```ts filename="next.config.ts" switcher highlight={5}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackLazyDynamicImports: true,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher highlight={4}
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackLazyDynamicImports: true,
  },
}

module.exports = nextConfig
```

## How it works

With `turbopackLazyDynamicImports` enabled, Turbopack waits to compile the target of a client-side dynamic `import()` until the browser requests its chunk. Code that the application never imports remains uncompiled during the development session.

For example, the module in this Client Component is compiled when the visitor selects the button:

```tsx filename="app/greeting-button.tsx" switcher
'use client'

import { useState } from 'react'

export function GreetingButton() {
  const [message, setMessage] = useState('')

  async function showGreeting() {
    const { getGreeting } = await import('./get-greeting')
    setMessage(getGreeting('Ada'))
  }

  return (
    <>
      <button onClick={showGreeting}>Show greeting</button>
      <p>{message}</p>
    </>
  )
}
```

```jsx filename="app/greeting-button.js" switcher
'use client'

import { useState } from 'react'

export function GreetingButton() {
  const [message, setMessage] = useState('')

  async function showGreeting() {
    const { getGreeting } = await import('./get-greeting')
    setMessage(getGreeting('Ada'))
  }

  return (
    <>
      <button onClick={showGreeting}>Show greeting</button>
      <p>{message}</p>
    </>
  )
}
```

> **Good to know:**
>
> - The option defaults to `false` and only affects Turbopack during `next dev`. It does not change production builds.
> - Errors in a deferred module appear when Turbopack first compiles that module.
> - Some [`next/dynamic`](/docs/app/guides/lazy-loading#nextdynamic) targets are still compiled eagerly.
> - To defer dynamic imports reached while rendering Client Components on the server, use [`turbopackLazyDynamicImportsSSR`](/docs/app/api-reference/config/next-config-js/turbopackLazyDynamicImportsSSR).

## Version History

| Version   | Changes                                                                |
| --------- | ---------------------------------------------------------------------- |
| `v16.4.0` | `experimental.turbopackLazyDynamicImports` configuration option added. |
