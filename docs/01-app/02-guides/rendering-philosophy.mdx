---
title: Next.js Rendering Philosophy
nav_title: Rendering Philosophy
description: Learn how Next.js treats static and dynamic rendering as a spectrum at the component level, and what this means for deployment.
related:
  description: Learn more about the features discussed on this page.
  links:
    - app/getting-started/caching
    - app/guides/streaming
    - app/guides/self-hosting
    - app/guides/deploying-to-platforms
---

## Static and Dynamic as a Spectrum

Most web frameworks draw a hard line between static and dynamic at the route level. A page is either prerendered at build time or server-rendered at request time. This model is simple to understand and simple to deploy: you upload static files to a CDN and point dynamic routes at a server.

Next.js takes a different approach: **the boundary between static and dynamic is at the component level, not the route level.** A single page can have a static shell that loads instantly and dynamic sections that stream in as they resolve. A cached function can live inside a dynamic route. A static page can be updated without a redeploy.

This is what Partial Prerendering, [Cache Components](/docs/app/getting-started/caching) (`use cache`), and [on-demand revalidation](/docs/app/api-reference/functions/revalidateTag) enable. They are not incremental features: they represent a rendering model that treats static and dynamic as a spectrum rather than a binary choice.

## What This Enables

This model benefits developers and users in concrete ways:

- **Faster perceived load times.** The static shell renders immediately while dynamic content streams in. Users see useful content right away instead of waiting for the entire page to render.
- **Incremental caching.** Developers can add caching and revalidation incrementally, without deciding upfront at build time whether a route is static or dynamic. Any page can be revalidated on demand, and any function can be cached with [`use cache`](/docs/app/api-reference/directives/use-cache).
- **Granular caching.** Cache a function with [`use cache`](/docs/app/api-reference/directives/use-cache), not a route. Revalidate a [tag](/docs/app/api-reference/functions/revalidateTag), not a deployment. This means an expensive database query can be cached independently of the rest of the page.

## The Trade-Off

Web frameworks differ in where they place the boundary between static and dynamic content. Each approach makes a different trade-off between developer flexibility and infrastructure complexity.

### Build-time prerendering

Every page is generated at build time. The output is static files that can be served from any CDN or file server with zero runtime infrastructure. Dynamic content, if any, requires client-side fetching after the page loads. This is the simplest model to deploy, but every content change requires a rebuild and redeploy.

### Route-level boundaries

Each route chooses whether it is static or dynamic. Static routes are prerendered at build time, dynamic routes are server-rendered per request. The infrastructure splits cleanly: static files go to a CDN, dynamic routes go to a server. This is straightforward to reason about but the choice is all-or-nothing per route. A mostly-static page with one dynamic element (a user greeting, a live price) must either be fully dynamic or fetch that element on the client after load.

### Component-level boundaries

This is the approach Next.js takes. Static and dynamic content coexist within a single streaming response. A page can have a static shell that loads instantly, a cached function that revalidates independently, and a dynamic section that streams in as it resolves, all without the developer splitting anything into separate routes or client-side fetches.

The trade-off is infrastructure complexity. A finer-grained rendering boundary transfers complexity from application code into the hosting platform. The infrastructure requirements described below exist because of this choice.

## Infrastructure Implications

The component-level rendering model has direct implications for platforms hosting Next.js applications:

- **Streaming** is required because static and dynamic content are served in a single response. The server sends initial content first, then streams dynamic portions as they resolve. See [Streaming](/docs/app/guides/streaming) for details.
- **Cache coordination** is required when running multiple instances because any cached content can be invalidated on demand via [`revalidateTag()`](/docs/app/api-reference/functions/revalidateTag) or [`revalidatePath()`](/docs/app/api-reference/functions/revalidatePath). See [How Revalidation Works](/docs/app/guides/how-revalidation-works) for the architecture.
- **Cache consistency** matters because revalidation regenerates both the HTML response and the RSC payload (the serialized React Server Components data used for client-side navigation). If these get out of sync, users may see inconsistent data during navigation. See [How Revalidation Works](/docs/app/guides/how-revalidation-works) for consistency requirements.
- **PPR shell delivery at CDN latency** can require additional platform integration to store the static shell separately and resume dynamic rendering correctly. See [PPR Platform Guide](/docs/app/guides/ppr-platform-guide) for implementation details.

Each of these infrastructure requirements maps directly to a capability: streaming enables progressive delivery, cache coordination propagates invalidations across instances, cache consistency keeps HTML and RSC aligned, and PPR-at-edge often requires extra shell/resume integration.

## Portability and Fidelity

Next.js runs as a Node.js server process, and a single process handles every feature correctly. Streaming support enables progressive delivery of Server Components and PPR; without it, responses are buffered but features still work. Additional infrastructure investments (CDN caching, edge compute, shared cache) improve performance and, in multi-instance deployments, reduce consistency gaps.

To make this concrete, we distinguish between two types of platform support:

**Functional fidelity** means every Next.js feature works correctly on the platform. The [adapter test suite](/docs/app/api-reference/adapters/testing-adapters) is the contract: if a platform's adapter passes the tests, it has full functional fidelity. This is binary: it passes or it doesn't. The test suite is open to contributions from platform partners to ensure it is fair and complete.

**Performance fidelity** means features achieve their optimal performance characteristics. For example, PPR's static shell served at CDN latency rather than origin latency, or ISR serving stale content instantly while revalidating in the background with sub-second propagation. Performance fidelity is a spectrum: every platform will achieve different levels based on their architecture, and platforms will improve over time.

A platform that achieves functional fidelity is a fully supported deployment target for Next.js. Performance fidelity is how platforms differentiate. See [Deploying to Platforms](/docs/app/guides/deploying-to-platforms) for the full feature compatibility matrix.

## CDN Feature Compatibility

Many CDNs have useful primitives for deeper Next.js integration (edge compute, key-value storage, blob storage), but end-to-end PPR resume support is still emerging and may require bespoke platform work. Most community adapters today deploy Next.js as a Node.js server without leveraging these CDN-specific primitives. See the [Deploying](/docs/app/getting-started/deploying#adapters) page for the current list of adapters.

See [Deploying to Platforms](/docs/app/guides/deploying-to-platforms#cdn-infrastructure-compatibility) for the full CDN compatibility table and [CDN Caching](/docs/app/guides/cdn-caching) for caching behavior details.
