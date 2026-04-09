---
title: Runtime Integration
description: Understand how build-time adapters and runtime cache interfaces work together.
---

The Deployment Adapter API is a **build-time** interface. It tells your platform what was built and how to route requests. **Runtime** behavior (request handling, streaming, caching) is handled by the Next.js server itself and by the cache interfaces [`cacheHandler`](/docs/app/api-reference/config/next-config-js/incrementalCacheHandlerPath) and [`cacheHandlers`](/docs/app/api-reference/config/next-config-js/cacheHandlers).

Together, the adapter and cache interfaces form the complete platform integration surface:

- **Adapter** (build-time): processes build outputs, configures routing, and sets up platform-specific infrastructure.
- **Cache Interfaces** (runtime): `cacheHandler` manages ISR/server cache storage and revalidation across instances; `cacheHandlers` configures `'use cache'` directive backends and tag coordination.

## Handler Context

When invoking entrypoints, adapters pass a `ctx` object to the Next.js handler. Key fields include:

- **`ctx.waitUntil`**: a function that accepts a promise. Use this to keep the serverless function alive after the response is sent, allowing background work like cache revalidation to complete.
- **`requestMeta.onCacheEntryV2`** (set via `addRequestMeta`): a callback that fires when a cache entry is generated or looked up. Use this to observe all cache operations (not just PPR) and propagate cache updates to your platform's storage backend. This callback fires on the instance that handled the request. For multi-instance deployments, your adapter should propagate updates to shared storage. See [How Revalidation Works](/docs/app/guides/how-revalidation-works) for coordination patterns.

## PPR Chain Headers

In the [prerenders output type](/docs/app/api-reference/adapters/output-types#prerenders-outputsprerenders), `pprChain.headers` contains the headers needed for the [resume protocol](/docs/app/api-reference/adapters/implementing-ppr-in-an-adapter). Specifically, it contains `{ 'next-resume': '1' }`.

When your adapter detects a PPR-enabled route with a cached static shell:

1. Set the `pprChain.headers` on the internal request to the Next.js handler.
2. Send the request as a **POST** with the `postponedState` as the request body.
3. The handler will render only the deferred Suspense boundaries and stream the result.

> **Good to know:** In standard `next start`, the server handles both the shell and dynamic render in a single pass automatically. The resume protocol is useful for adapter-based deployments and CDN-to-origin architectures that want to serve the shell separately. See the [PPR Platform Guide](/docs/app/guides/ppr-platform-guide) for the full implementation context.
