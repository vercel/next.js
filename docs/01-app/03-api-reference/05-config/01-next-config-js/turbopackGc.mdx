---
title: turbopackGc
description: Configure Turbopack to remove unreachable work from memory and the persistent cache.
version: experimental
related:
  links:
    - app/api-reference/config/next-config-js/turbopackFileSystemCache
    - app/api-reference/config/next-config-js/turbopackMemoryEviction
---

The `experimental.turbopackGc` option enables garbage collection for Turbopack's in-memory and [persistent caches](/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache).

```ts filename="next.config.ts" switcher highlight={5}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackGc: true,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher highlight={4}
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackGc: true,
  },
}

module.exports = nextConfig
```

## Reference

`turbopackGc` defaults to `false` and accepts a boolean or an object:

| Value                            | Description                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `false`                          | Disables garbage collection.                                                 |
| `true`                           | Enables garbage collection with the default timings.                         |
| `{ minProgressMs?, rootTtlMs? }` | Enables garbage collection and overrides one or more of the default timings. |

When enabled, Turbopack removes unreachable work from memory and its persistent cache. The option applies to both `next dev` and `next build` when they use Turbopack.

> **Good to know:**
>
> - Garbage collection requires the [Turbopack FileSystem Cache](/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache). The option has no effect when the cache is disabled for the current command.
> - In long-running read-write sessions, Turbopack disables garbage collection when [`turbopackMemoryEviction`](/docs/app/api-reference/config/next-config-js/turbopackMemoryEviction) is set to `false`.

### Options

The object form accepts the following properties:

| Property        | Type                  | Default              | Description                                                                       |
| --------------- | --------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `minProgressMs` | Non-negative `number` | `100`                | Minimum time a garbage collection pass runs before it honors an interruption.     |
| `rootTtlMs`     | Non-negative `number` | `259200000` (3 days) | Time a garbage collection root can remain unanchored before Turbopack removes it. |

The following configuration lets a garbage collection pass run for at least 200 milliseconds before yielding and expires unanchored roots after one day:

```ts filename="next.config.ts" switcher highlight={5-8}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackGc: {
      minProgressMs: 200,
      rootTtlMs: 24 * 60 * 60 * 1000,
    },
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher highlight={4-7}
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackGc: {
      minProgressMs: 200,
      rootTtlMs: 24 * 60 * 60 * 1000,
    },
  },
}

module.exports = nextConfig
```

## Version History

| Version   | Changes                                                |
| --------- | ------------------------------------------------------ |
| `v16.4.0` | `experimental.turbopackGc` configuration option added. |
