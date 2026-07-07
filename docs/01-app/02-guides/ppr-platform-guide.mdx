---
title: Implementing Partial Prerendering on your platform
nav_title: PPR Platform Guide
description: A guide for platform engineers on implementing PPR support, from basic origin rendering to optimized CDN integration.
related:
  description: Related guides and references.
  links:
    - app/guides/rendering-philosophy
    - app/guides/streaming
    - app/guides/deploying-to-platforms
    - app/api-reference/config/next-config-js/adapterPath
---

Partial Prerendering (PPR) combines static and dynamic rendering in a single route. At build time, Next.js generates a static HTML shell and a `postponedState` blob for each PPR-enabled route. At request time, the shell is served immediately and dynamic portions are rendered and streamed to the client.

This page explains how platforms can implement PPR support at different levels of sophistication.

## How PPR Works

### Build time

For each PPR route, Next.js produces:

- A **static HTML shell** containing all the content that can be prerendered, with [Suspense](/docs/app/guides/streaming#what-is-streaming) fallbacks where dynamic content will appear.
- A **`postponedState`** value: a serialized string. Treat it as opaque: pass it through without parsing or modifying it. Altering `postponedState` produces incorrect dynamic rendering output.
- An **RSC payload** for the static portions of the page.

### Request time

When a request arrives for a PPR route:

1. The server sends the static HTML shell to the client immediately.
2. The server resumes rendering the dynamic portions using the postponed state.
3. Dynamic content is streamed to the client, allowing React to hydrate the deferred Suspense boundaries.

The client sees the static shell instantly, then dynamic content appears as it resolves.

## Storing PPR Artifacts

Each PPR route requires two artifacts to be stored together:

1. The static HTML shell.
2. The `postponedState` blob.

These must be stored and updated atomically. When a PPR route is revalidated (via [time-based](/docs/app/guides/incremental-static-regeneration) or [on-demand revalidation](/docs/app/api-reference/functions/revalidateTag)), Next.js regenerates both the shell and the postponed state together. Serving a new shell with an old postponed state, or vice versa, will produce incorrect dynamic content.

Use [`requestMeta.onCacheEntryV2`](/docs/app/api-reference/adapters/implementing-ppr-in-an-adapter) in your adapter to observe cache updates and propagate them to your storage backend.

## Origin-Only Implementation

**This is the simplest approach and works on every platform that supports streaming HTTP responses.**

All requests go directly to the Next.js server. The server reads the shell from its local cache, sends it, then renders and streams the dynamic content. This is what `next start` does by default.

No additional infrastructure is needed. If your platform supports streaming HTTP responses, it supports PPR.

## CDN Shell + Origin Compute

For better TTFB, the static HTML shell can be cached at the CDN edge. When a request arrives:

1. The CDN serves the cached shell immediately (edge latency).
2. The CDN sends a resume request to the origin server (ideally in parallel with streaming the shell).
3. The origin server renders only the dynamic portions and streams them back.
4. The CDN concatenates the shell and dynamic content into a single streaming response to the client.

This requires the CDN to support a mechanism for combining cached and dynamic content in a single streaming response. The static shell TTFB drops to edge latency while dynamic content still streams from origin.

For the lowest possible latency, the shell can be served from edge storage (for example, a KV store populated during `onBuildComplete`) rather than from a CDN cache. This is a platform architecture decision and does not require any changes to the Next.js application.

## The Resume Protocol

The **resume protocol** tells the Next.js handler to skip the shell and render only the dynamic portions. It is used by CDN-to-origin architectures and adapter-based deployments that serve the shell separately.

In standard `next start`, the server handles both the shell and dynamic render in a single pass automatically.

### CDN-to-origin

When the CDN makes an HTTP request to a separate Next.js origin:

- Send a **POST** request to the route with the header `next-resume: 1`.
- Include the `postponedState` blob as the **request body**.
- The server will render only the deferred Suspense boundaries and stream the result.

> **Good to know:** When a POST request combines a Server Action with a PPR resume, the request body contains the postponed state followed by the action body. The `x-next-resume-state-length` header carries the byte length of the postponed state prefix so the handler can separate the two. For a pure PPR resume (the common case), the entire request body is the postponed state and this header is not needed.

### Adapter-based

When the platform invokes the handler function directly:

- Call the entrypoint handler with `req.method` set to `'POST'`, the `next-resume: 1` header on the request, and the `postponedState` as the request body. (You can also pass `requestMeta: { postponed: postponedState }` as the third argument to the handler invocation, which is equivalent but bypasses the HTTP layer entirely.)
- The handler renders only the deferred Suspense boundaries and streams the result to `res`.
- No HTTP round-trip is needed: the handler is invoked in-process.

### Finding PPR routes in build output

In the [adapter output](/docs/app/api-reference/adapters/output-types), PPR routes are identified by `renderingMode: 'PARTIALLY_STATIC'` in the prerenders array. Iterate `outputs.prerenders` to find these entries and read `fallback.postponedState`.

`pprChain.headers` contains the headers needed for the resume protocol: `{ 'next-resume': '1' }`.

For detailed implementation with code examples, see [Implementing PPR in an Adapter](/docs/app/api-reference/adapters/implementing-ppr-in-an-adapter).

## Implementation Checklist

1. **Read PPR outputs at build time.** In your adapter's `onBuildComplete`, identify prerenders with `renderingMode: 'PARTIALLY_STATIC'`. Store the shell HTML and `postponedState` in your cache.

2. **Serve the shell at request time.** For incoming requests to PPR routes, serve the cached shell immediately and begin streaming.

3. **Resume dynamic rendering.** For CDN-to-origin: send a POST request to the Next.js handler with the `next-resume: 1` header and the postponed state as the body. For adapter-based: call the handler directly with POST method and the postponed state in the request body (or pass `requestMeta: { postponed: postponedState }` to the handler). Stream the response back to the client.

4. **Handle cache updates.** Use `requestMeta.onCacheEntryV2` to capture new shell + postponed state pairs after revalidation, and update your cache atomically.

5. **Support graceful degradation.** If the postponed state is unavailable or stale, fall back to a full server render. The user gets a complete page without the shell-first optimization.

For the complete adapter API reference and implementation examples, see the [Deployment Adapter API](/docs/app/api-reference/config/next-config-js/adapterPath).
