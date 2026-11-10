---
title: Turbopack Memory Eviction
nav_title: turbopackMemoryEviction
description: Learn how to control Turbopack's memory eviction strategy for the persistent cache.
---

## Usage

`turbopackMemoryEviction` controls whether Turbopack reclaims memory while the persistent (FileSystem) cache is enabled. After Turbopack writes a snapshot of its cache to disk, it can 'evict' the in-memory copies of that data and reload them from disk on demand.

Currently there are three options

- `false`: never evict. Cached data stays in memory for the lifetime of the process.
- `'auto'` (default): evict after a snapshot only once enough memory has been allocated since the last eviction to make it worthwhile. Leverages thresholds and memory pressure feedback from the operating system.
- `'full'`: evict all possible data from memory every time we save to disk.

> **Good to know:** This option only has an effect in `next dev` sessions when the [FileSystem Cache](/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache) is enabled, since eviction relies on data already being persisted to disk. It is experimental and under active development.

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackMemoryEviction: 'auto',
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackMemoryEviction: 'auto',
  },
}

module.exports = nextConfig
```

## Version Changes

| Version   | Changes                                             |
| --------- | --------------------------------------------------- |
| `v16.3.0` | `turbopackMemoryEviction` released as experimental. |
