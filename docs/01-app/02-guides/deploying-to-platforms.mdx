---
title: Deploying Next.js to different platforms
nav_title: Deploying to Platforms
description: Understand which Next.js features require specific platform capabilities and how to choose the right deployment target.
related:
  description: Related guides and references.
  links:
    - app/guides/rendering-philosophy
    - app/guides/self-hosting
    - app/getting-started/deploying
    - app/api-reference/config/next-config-js/adapterPath
---

Next.js [treats static and dynamic content as a spectrum](/docs/app/guides/rendering-philosophy) at the component level. Different features in this model require different platform capabilities. This page helps you understand what your platform needs to support and how to configure your deployment.

## Minimum Requirements

To run Next.js, your platform needs **a Node.js server**. That's it.

A single `next start` process handles every Next.js feature correctly: Server Components, ISR, PPR, Cache Components, Server Actions, Proxy, and `after()`. Streaming support is needed for features like PPR and Server Components to deliver content progressively (without it, responses are buffered and sent as a whole, which still works but loses the streaming performance benefit). Additional infrastructure (CDN caching, edge compute, shared cache) primarily improves performance and multi-instance consistency. In multi-instance deployments, shared cache and tag coordination reduce stale divergence between instances. The only additional dependency is the `sharp` package, which is required for [Image Optimization](/docs/app/api-reference/components/image).

## Functional Fidelity vs. Performance Fidelity

When evaluating platform support for Next.js, it helps to distinguish between two levels:

**Functional fidelity** means every Next.js feature works correctly. The [adapter test suite](/docs/app/api-reference/adapters/testing-adapters) is the contract: if a platform's adapter passes the tests, it supports Next.js. This is binary: it passes or it doesn't.

**Performance fidelity** means features achieve their optimal performance characteristics. Examples include PPR's static shell served at CDN latency rather than origin latency, or ISR serving stale content instantly with sub-second revalidation propagation. Performance fidelity is a spectrum that every platform will achieve differently based on their architecture.

A platform that achieves functional fidelity is a fully supported deployment target for Next.js. Performance fidelity is how platforms differentiate, and it improves incrementally over time.

Use the feature matrix below through this lens: "Streaming Required" and "Shared Cache Recommended" describe what is needed for functional fidelity. "Edge Stitching" is a performance fidelity optimization.

## Feature Support Matrix

Different features require different infrastructure capabilities. The "Edge Stitching" column is a **performance optimization**, not a correctness requirement. All features work correctly from a single origin server.

| Feature                        | Streaming | Shared Cache | Edge Stitching | Notes                                                                                            |
| ------------------------------ | --------- | ------------ | -------------- | ------------------------------------------------------------------------------------------------ |
| Server Components              | Required  | No           | No             | Basic streaming support                                                                          |
| ISR (time-based)               | No        | Recommended  | No             | Works per-instance without shared cache                                                          |
| ISR (on-demand)                | No        | Recommended  | No             | [Tag propagation](/docs/app/guides/how-revalidation-works) needs shared cache for multi-instance |
| Partial Prerendering           | Required  | Recommended  | Optional       | [See PPR Platform Guide](/docs/app/guides/ppr-platform-guide)                                    |
| Cache Components (`use cache`) | Required  | Recommended  | No             | Shared cache enables cross-instance consistency                                                  |
| Proxy / Middleware             | No        | No           | No             | Runs at edge or origin                                                                           |
| Server Actions                 | Required  | No           | No             | POST requests with streaming response                                                            |
| `after()`                      | No        | No           | No             | Requires [graceful shutdown](/docs/app/guides/self-hosting#after) support                        |

**Streaming Required** means the platform must support chunked transfer encoding or HTTP/2 streaming and must not buffer the response before sending it to the client.

**Shared Cache Recommended** means multiple server instances benefit from shared cache backends to coordinate. For ISR and server response caching, use [`cacheHandler`](/docs/app/api-reference/config/next-config-js/incrementalCacheHandlerPath). For `'use cache'` entries, use [`cacheHandlers`](/docs/app/api-reference/config/next-config-js/cacheHandlers). Without shared cache, each instance maintains its own cache independently — features still work correctly on each instance, but revalidation events don't propagate across instances.

## CDN Infrastructure Compatibility

The following table maps infrastructure primitives for each major CDN. These are available building blocks, not finished integrations:

| CDN               | Edge Compute | Key-Value / Tags | Blob Storage   | PPR Resuming |
| ----------------- | ------------ | ---------------- | -------------- | ------------ |
| Cloudflare        | Workers      | KV               | R2             | Yes (worker) |
| Akamai            | EdgeWorkers  | EdgeKV           | Object Storage | Yes (worker) |
| Amazon CloudFront | Lambda@Edge  | KeyValueStore    | S3             | Yes (Lambda) |
| Fastly            | Compute      | KV Store         | Object Storage | Yes (WASM)   |
| Azure             | Functions    | Managed Redis    | Blob Storage   | Yes (server) |
| Google Cloud      | Cloud Run    | Various KV       | Cloud Storage  | Yes (server) |

These are available building blocks, not finished integrations. Most community adapters today deploy Next.js as a Docker container or Node.js server without leveraging CDN-specific primitives like edge KV or PPR resuming. See the [Deploying](/docs/app/getting-started/deploying#adapters) page for the current list of adapters. For CDN-specific caching considerations (including known limitations with `Vary` on custom headers), see [CDN Caching](/docs/app/guides/cdn-caching).

## Adapters

Next.js provides a [Deployment Adapter API](/docs/app/api-reference/config/next-config-js/adapterPath) that lets platforms customize how Next.js applications are built and deployed for their infrastructure. Adapters run at build time and produce platform-specific output from the standard Next.js build. Anyone can build an adapter using the public API with no special access required.

The adapter API plus Next.js caching interfaces form the complete platform integration surface. The adapter handles build-time output, while `cacheHandler` and `cacheHandlers` cover different runtime caching paths. `cacheHandler` (singular) covers server cache paths like ISR, route handlers, patched `fetch`/`unstable_cache`, and image optimization. `cacheHandlers` (plural) configures `'use cache'` directive backends.

### Verified Adapters

A **verified adapter** is one that meets two requirements:

1. **Open source.** The adapter source code is publicly available so the community and the Next.js team can inspect, contribute to, and verify it.
2. **Runs the compatibility test suite.** The platform provides a way to run the full [Next.js compatibility test suite](/docs/app/api-reference/adapters/testing-adapters) against their adapter. This gives visibility into which features work, which are in progress, and where gaps remain.

Verified adapters are hosted under the [Next.js GitHub organization](https://github.com/nextjs), listed as supported deployment targets in the Next.js documentation, and maintained by their respective platform teams. There are no private framework hooks or integration paths: Vercel's adapter uses the same public API as every other adapter.

For verified adapters and platforms working toward verified status through the [Ecosystem Working Group](https://nextjs.org/ecosystem-working-group), the Next.js team commits to:

- **Coordinated testing.** Before major releases, we work with platform teams to run the compatibility test suite and surface issues early.
- **Early access.** Adapter authors receive early access to API changes during RFCs and release candidates.
- **Direct support.** When the adapter contract needs updating, we work directly with adapter teams.

> **Good to know:** Platforms can build closed-source adapters on the same public API and test suite. However, closed-source adapters will not be listed as verified, since the Next.js team cannot verify what it cannot inspect.

## A Note on Infrastructure Requirements

Next.js's [rendering model](/docs/app/guides/rendering-philosophy) places the static/dynamic boundary at the component level rather than the route level. Finer-grained boundaries provide more flexibility for developers at the cost of broader requirements for hosting platforms. This is a deliberate trade-off: the infrastructure requirements on this page exist because of what the rendering model delivers.
