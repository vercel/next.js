---
title: Using a CDN with Next.js
nav_title: CDN Caching
description: Learn how CDN caching works with Next.js, including what works today, cache variability, and the direction toward pathname-based cache keying.
related:
  description: Related guides and references.
  links:
    - app/guides/deploying-to-platforms
    - app/guides/self-hosting
    - app/guides/streaming
    - app/api-reference/config/next-config-js/assetPrefix
---

Next.js sets standard `Cache-Control` headers that CDNs can use to cache responses at the edge. This page covers what works today, where CDN caching is challenging, and the direction toward eliminating custom-header dependencies.

## What Works Today

### Cache-Control headers

Next.js sets `Cache-Control` headers based on the rendering strategy of each route:

- **Static pages** (no revalidation): `s-maxage=31536000` (one year)
- **ISR pages** (time-based revalidation): `s-maxage={revalidate}, stale-while-revalidate={expire - revalidate}`. The default `expire` is one year, so `stale-while-revalidate` is included in the response header by default. You can customize this with [`cacheLife`](/docs/app/api-reference/functions/cacheLife).
- **Dynamic pages** (no caching): `private, no-cache, no-store, max-age=0, must-revalidate`

CDNs that respect `s-maxage` and `stale-while-revalidate` can cache static and ISR pages at the edge. However, CDN-level caching alone does not support on-demand revalidation ([`revalidateTag()`](/docs/app/api-reference/functions/revalidateTag) / [`revalidatePath()`](/docs/app/api-reference/functions/revalidatePath)): those calls invalidate the Next.js server cache, but the CDN will continue serving its cached copy until the `s-maxage` TTL expires. To propagate on-demand revalidation to the CDN, trigger CDN purges alongside your revalidation call. A common pattern is: call `revalidateTag()`/`revalidatePath()` to invalidate the Next.js server cache, then call your CDN purge API for the affected keys (including both HTML and RSC variants).

### Static assets

Static assets (JavaScript, CSS, images, fonts) served from `/_next/static/` include content hashes in their filenames and have a 1 year `max-age` and `immutable` directive: `public,max-age=31536000,immutable`

You can use [`assetPrefix`](/docs/app/api-reference/config/next-config-js/assetPrefix) to serve static assets from a different domain or CDN origin.

### Static prefetches (PPR-enabled routes)

When a route has Partial Prerendering enabled and the `next-router-prefetch` header is set (indicating a static prefetch), the response is deterministic: it returns the same prerendered content regardless of the client's router state. The `next-router-state-tree` header is not parsed for these requests, so it does not affect the response.

For PPR-enabled routes, a CDN can cache static prefetch responses if it:

1. Includes the `_rsc` search parameter in the cache key (to distinguish prefetch variants from HTML responses).
2. Respects the `Cache-Control` headers Next.js sets on the response.

> **Good to know:** For routes without PPR, the `next-router-state-tree` header is read during prefetch requests to determine which segments to include, which increases cache `vary` as it passes the current router state. When Cache Components is enabled, segment-level prefetches already use pathname-based routes (for example, `/page.segments/_tree.segment.rsc`), and CDNs can cache these with standard pathname-based cache keys.

## Where CDN Caching Is Challenging

App Router responses can vary based on several custom request headers. Next.js sets a `Vary` header on responses to signal this to CDNs:

- `rsc` — whether the request should return a React Server Components (RSC) payload instead of HTML
- `next-router-state-tree` — the client's current router state, used for targeted segment updates during dynamic navigations
- `next-router-prefetch` — whether this is a prefetch request
- `next-router-segment-prefetch` — the specific segment being prefetched
- `next-url` — added only for routes that use [interception routes](/docs/app/api-reference/file-conventions/intercepting-routes), carries the URL being intercepted

> **Good to know:** [`proxy.js`](/docs/app/api-reference/file-conventions/proxy) (previously Middleware) should run before the CDN cache so it remains the source of truth for auth, redirects, and rewrites. If your deployment places `proxy.js` behind the CDN, configure the cache layer to bypass caching for routes that depend on `proxy.js` decisions.

Many CDNs don't support `Vary` without additional configuration. Next.js addresses this with the `_rsc` search parameter: a hash of the relevant request header values that acts as a cache-key, ensuring different response variants get different cache keys. This ensures correct responses even on CDNs that ignore `Vary`.

## Handling Headers at the CDN

### What you can safely ignore

These headers can be omitted in specific cases without causing protocol errors. The server still returns a parseable response, but it may be larger or less targeted to the specific navigation:

**`next-router-state-tree`**: when omitted on non-prefetch RSC requests, the server returns a full payload instead of a targeted segment update.

**`next-router-segment-prefetch`**: when omitted on prefetch requests, the server falls back to a broader prefetch payload instead of a segment-specific one.

**`next-url`**: used for [interception routes](/docs/app/api-reference/file-conventions/intercepting-routes) to vary the response based on the referring page. If omitted, interception routes are not supported as the server doesn't know what original path to match against. The response returned is for regular navigation when `next-url` is omitted: the user sees the target page instead of the intercepted target page.

### What you must preserve

**The `rsc` header** must be forwarded from the client to the server. This header tells the server to return an RSC payload instead of HTML. If a CDN strips it, the server returns HTML when the client-side router expects RSC data, which breaks client-side navigation, causing browser navigations instead. The `Vary` header and `_rsc` parameter exist specifically to prevent CDNs from serving a cached HTML response to an RSC request (or vice versa).

**When `next-router-prefetch` is present, preserve both the prefetch header and the `_rsc` search parameter.** For prefetch flows, `_rsc` is a required cache-busting discriminator and should be treated as mandatory.

**The `_rsc` search parameter** must be included in the cache key. It distinguishes response variants (HTML vs. RSC, different prefetch types). Ensure your CDN does not strip query parameters from cache keys, as some CDNs do this by default. When the `experimental.validateRSCRequestHeaders` option is enabled and a RSC request arrives without the correct `_rsc` value, the server responds with a **307 redirect** to the URL with the correct hash. CDNs should follow this redirect. Platforms that compute the hash upstream can rewrite requests to include the correct `_rsc` before forwarding to avoid an extra round trip.

> **Good to know:** Today, `next-url` is included in the `_rsc` hash even during static prefetches. This means you cannot safely ignore it under the current scheme without potentially getting cache misses. The pathname-based direction described below resolves this gap.

## Direction: Pathname-Based Cache Keying

The Next.js team is working on moving all cache-affecting inputs into the URL pathname, eliminating the need for `Vary` on custom headers and removing the `_rsc` search parameter. This resolves the CDN caching challenges described above.

### How it works

The approach extends the routing scheme that [`output: 'export'`](/docs/app/guides/static-exports) and segment prefetches already use today. File extensions in the pathname identify the response type:

- **Full page RSC**: `/my/page.rsc` returns the RSC payload for the entire page
- **Segment RSC**: `/my/page.segments/path/to/segment.segment.rsc` returns the RSC payload for a specific segment

Under this model:

- **The pathname determines the cache key.** Anything in the pathname affects which response variant is returned.
- **Search parameters can be safely dropped** without affecting returned responses.
- **Standard HTTP cache headers** (`Cache-Control`, `max-age`, etc.) are respected as usual.
- **No `Vary` support needed** from the CDN.

A CDN would cache Next.js responses by using the pathname as the cache key, ignoring search parameters, and respecting standard `Cache-Control` headers. No need to understand `Vary`, inspect custom headers, or program edge logic.

### What changes for interception routes

Under the current scheme, `next-url` contributes to the `_rsc` hash, so dropping it causes cache misses. Under the pathname-based scheme, interception variability would be encoded in a search parameter (not the pathname):

- If a CDN preserves search params, interception works correctly.
- If a CDN drops search params, interception is not supported. It would gracefully degrade to the non-intercepted page, client-side navigations won't break.

This makes interception route support an opt-in CDN capability rather than a requirement.

### Current status

This direction extends patterns that are already operational in the codebase (segment prefetch paths, `output: 'export'` mode). It is in active design.

## CDN Feature Compatibility

For a full table showing the infrastructure primitives available on every major CDN (edge compute, key-value storage, blob storage, PPR resuming), see [Deploying to Platforms](/docs/app/guides/deploying-to-platforms#cdn-infrastructure-compatibility).
