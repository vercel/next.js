---
title: prefetchInlining
description: Override how the App Router bundles small prefetch responses together.
version: experimental
related:
  title: Related
  description: View related API references and guides.
  links:
    - app/api-reference/components/link
    - app/guides/prefetching
---

When the App Router prefetches a route, it can bundle small segment responses into a single response instead of requesting each one separately. This reduces the number of prefetch requests at the cost of duplicating some shared segment data across routes. This behavior is on by default, and most apps should leave it that way.

The `experimental.prefetchInlining` option lets you override this behavior or disable inlining while debugging navigation issues or measuring request volume. For most applications, there is no need to change the default behavior.

> **Good to know**: The inlining behavior is a permanent part of the App Router. Only the `experimental.prefetchInlining` configuration is experimental, so its options may still change.

## Usage

To turn off prefetch inlining, set `experimental.prefetchInlining` to `false`:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    prefetchInlining: false,
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    prefetchInlining: false,
  },
}

module.exports = nextConfig
```

To override the thresholds instead of disabling inlining, pass an object. Any value you omit keeps its default:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    prefetchInlining: {
      maxSize: 2048,
      maxBundleSize: 10240,
    },
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    prefetchInlining: {
      maxSize: 2048,
      maxBundleSize: 10240,
    },
  },
}

module.exports = nextConfig
```

## Reference

| Value    | Description                                                                  |
| -------- | ---------------------------------------------------------------------------- |
| `true`   | Inlines prefetch responses with the default thresholds. This is the default. |
| `false`  | Disables prefetch inlining. Each segment is prefetched as its own request.   |
| `object` | Inlines prefetch responses using the `maxSize` or `maxBundleSize` you set.   |

When you pass an object, the following options control the thresholds. Both are measured in bytes of the gzip-compressed segment response:

| Option          | Type     | Default | Description                                                                             |
| --------------- | -------- | ------- | --------------------------------------------------------------------------------------- |
| `maxSize`       | `number` | `2048`  | Largest a single segment response can be to still be eligible for inlining.             |
| `maxBundleSize` | `number` | `10240` | Largest total size that can be inlined into one bundled prefetch response along a path. |

Lower thresholds keep more per-segment deduplication; higher thresholds inline more data and cut request count further.

## Version History

| Version | Change                                              |
| ------- | --------------------------------------------------- |
| 16.3.0  | `experimental.prefetchInlining` enabled by default. |
| 16.2.0  | `experimental.prefetchInlining` added.              |
