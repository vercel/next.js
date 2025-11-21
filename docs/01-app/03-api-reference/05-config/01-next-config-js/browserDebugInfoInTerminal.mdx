---
title: browserDebugInfoInTerminal
description: Forward browser console logs and errors to your terminal during development.
version: experimental
---

The `experimental.browserDebugInfoInTerminal` option forwards console output and runtime errors originating in the browser to the dev server terminal.

This option is disabled by default. When enabled it only works in development mode.

## Usage

Enable forwarding:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    browserDebugInfoInTerminal: true,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    browserDebugInfoInTerminal: true,
  },
}

module.exports = nextConfig
```

### Serialization limits

Deeply nested objects/arrays are truncated using **sensible defaults**. You can tweak these limits:

- **depthLimit**: (optional) Limit stringification depth for nested objects/arrays. Default: 5
- **edgeLimit**: (optional) Max number of properties or elements to include per object or array. Default: 100

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    browserDebugInfoInTerminal: {
      depthLimit: 5,
      edgeLimit: 100,
    },
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    browserDebugInfoInTerminal: {
      depthLimit: 5,
      edgeLimit: 100,
    },
  },
}

module.exports = nextConfig
```

### Source location

Source locations are included by default when this feature is enabled.

```tsx filename="app/page.tsx" highlight={8}
'use client'

export default function Home() {
  return (
    <button
      type="button"
      onClick={() => {
        console.log('Hello World')
      }}
    >
      Click me
    </button>
  )
}
```

Clicking the button prints this message to the terminal.

```bash filename="Terminal"
[browser] Hello World (app/page.tsx:8:17)
```

To suppress them, set `showSourceLocation: false`.

- **showSourceLocation**: Include source location info when available.

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    browserDebugInfoInTerminal: {
      showSourceLocation: false,
    },
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    browserDebugInfoInTerminal: {
      showSourceLocation: false,
    },
  },
}

module.exports = nextConfig
```

| Version   | Changes                                              |
| --------- | ---------------------------------------------------- |
| `v15.4.0` | experimental `browserDebugInfoInTerminal` introduced |
