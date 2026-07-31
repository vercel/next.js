---
title: turbopackChunking
description: Configure how Turbopack splits your client-side JavaScript into chunks in production.
version: experimental
---

`experimental.turbopackChunking` lets you configure Turbopack's production JavaScript
chunker. These options allow you to change the assumptions the chunker makes about user
behaviour, tweak the raw size thresholds it uses, and enable the experimental component
chunks feature.

By default, Turbopack's chunking is configured as follows:

```ts filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig = {
  experimental: {
    turbopackChunking: {
      minChunkSize: 50000,
      maxChunkCountPerGroup: 40,
      maxMergeChunkSize: 200000,
      minComponentChunkSize: 20000,
      generateComponentChunks: false,
    },
  },
} satisfies NextConfig

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopackChunking: {
      minChunkSize: 50000,
      maxChunkCountPerGroup: 40,
      maxMergeChunkSize: 200000,
      minComponentChunkSize: 20000,
      generateComponentChunks: false,
    },
  },
}

module.exports = nextConfig
```

## Size Thresholds

The following options control how aggressively Turbopack merges chunks and how large a chunk is
allowed to grow. Sizes are in bytes of uncompressed, unminified code (roughly 5x
the size of the compressed, minified output).

- **`minChunkSize`** (default `50000`): Turbopack will avoid creating more
  than one chunk smaller than this size by merging small chunks into larger ones.
  Raising this number will produce fewer, larger chunks. Meanwhile, lowering it
  will produce more chunks that are smaller.
- **`maxChunkCountPerGroup`** (default `40`): Turbopack will not emit more than
  this many chunks per chunk group (eg. a route or a dynamic import). Lowering
  this number will lead to more aggressive merging and less network requests
  per-page. Raising it will produce smaller chunks and increase the likelihood
  of cache hits when navigating.
- **`maxMergeChunkSize`** (default `200000`): Turbopack never merges a chunk
  larger than this size with other chunks. This keeps the code in large chunks
  from being duplicated across multiple large output chunks.

When merging chunks, the trade-off being made is an improvement to performance on initial page
loads at the cost of navigation performance. This is because each additional network request
being made is costly, however, smaller chunks are more likely to be re-usable across pages.

## Component Chunks

Producing component chunks is an experimental feature that aims to give you the initial
page load benefits of merged chunks without sacrificing reusability. This feature lets
the runtime dynamically choose whether to load a merged chunk as a single file, or to
load only the component chunks it doesn't already have. Additionally, chunks that were
already loaded as part of a merged chunk will not be re-downloaded.

This avoids re-downloading JavaScript the browser already has when navigating.

- **`generateComponentChunks`** (default `false`): when enabled, each merged
  production chunk also emits its constituent component chunks alongside it, so
  the browser runtime can fetch individual component chunks.
- **`minComponentChunkSize`** (default `20000`): component chunks smaller than
  this size are folded into a single component instead of being emitted on their own,
  to avoid producing many tiny chunks.

## Heuristics

These change the assumptions the chunker makes when weighing whether merging two
chunks is worth it.

- **`firstPageLoadPriority`** (a number between `0` and `1`): how heavily to
  weight the benefit of merging chunks for a single page load. Higher values
  merge more eagerly. If you don't have a better value, your site's bounce rate
  is a good approximation.
- **`priorityRoutes`** (an array of `RegExp`): routes that are often the first
  page a visitor lands on (e.g. the homepage). Their client-side bundles are
  merged more eagerly to reduce the single-route request cost, at the cost of
  extra requests when navigating to other pages.
- **`priorityBoost`** (default `1.5`): a multiplier on the single-request
  probability of `priorityRoutes` routes. Higher values merge those routes'
  bundles more aggressively.
- **`requestCost`** (default `200000`): the estimated cost of an
  additional request, in bytes of uncompressed, unminified code. Larger values
  bias toward fewer, larger chunks and fewer requests overall.
