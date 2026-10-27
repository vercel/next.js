# Current baseline compatibility findings

The suite uses the documentation as its expected-behavior contract. These are observed discrepancies at revision `7748e532a1`, not exemptions: the assertions remain active. Fixing the behavior should make them pass. They are listed here so a developer can distinguish a known reference-server failure from a newly introduced regression.

## Immutable hashed asset cache policy (H07)

The [header reference](../../../docs/01-app/03-api-reference/05-config/01-next-config-js/headers.mdx) says the cache policy for immutable hashed assets cannot be overridden.

[The HTTP contract test](./http/docs-http-contract/docs-http-contract.test.ts) configures `Cache-Control: private, max-age=17` for static assets and fetches emitted script URLs. The current server returns that configured policy on content-hashed JavaScript. The expected policy is `public, max-age=31536000, immutable`.

This reproduces with production Turbopack and Webpack. It is not a comparison against a mutable development bundle.

## Configured image optimization endpoint (R32)

The [Image reference](../../../docs/01-app/03-api-reference/02-components/image.mdx) permits changing the Image Optimization API path with `images.path`.

[The route-selection test](./router/docs-route-selection/docs-route-selection.test.ts) configures `/media/image`, renders `next/image`, and fetches the advertised URL. The URL correctly uses `/media/image`, but the response is 404 instead of an image. Ordinary default-path optimization and its source/quality restrictions pass.

This reproduces in production and development with Turbopack.

## Pages client redirect URL with a matching Proxy (R09)

The [redirect reference](../../../docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.mdx) says configured redirects apply to Pages client navigation when Proxy is present and matches the path.

[The routing-phase fixture](./router/docs-router-contract/docs-router-contract.test.ts) verifies document redirects and compares client navigation with/without matching Proxy. With matching Proxy, the current client renders the redirect destination but retains the source path in the address bar after navigation completes. The active assertion expects the redirect destination URL.

Production and development Turbopack runs reproduce this discrepancy. Development Webpack also fails the documented client redirect outcome.

## GET caching beside other methods (R28)

The [Route Handler guide](../../../docs/01-app/01-getting-started/15-route-handlers.mdx) says GET can opt into caching and other methods remain uncached even when defined beside a cached GET.

[The method-cache fixture](./router/docs-handler-cache/docs-handler-cache.test.ts) declares `dynamic = 'force-static'` and compares independent invocation IDs. A GET-only handler caches its response in production. A handler that defines GET alongside POST/PUT/PATCH/DELETE/HEAD/OPTIONS produces a fresh GET response each time instead. The other methods correctly remain uncached.

This reproduces with production Webpack and Turbopack. All nine development assertions pass.

## Pages Preview Mode on Node.js 26 (R29)

The [Preview Mode guide](../../../docs/02-pages/02-guides/preview-mode.mdx) documents `res.setPreviewData()` setting the preview cookies and passing preview data to request-time page rendering.

The existing [Preview Mode suite](../prerender-preview/prerender-preview.test.ts) fails on Node.js 26.12.1 in development with Turbopack: enabling Preview Mode returns HTTP 500, and later requests cannot observe its cookies or data. The server reports `jsonwebtoken.sign is not a function`. Loading the bundled `jsonwebtoken` directly identifies an earlier initialization error: its bundled buffer comparison dependency reads `buffer.SlowBuffer.prototype`, but `buffer.SlowBuffer` is undefined on that runtime.

The checked-in and built JWT files are byte-identical, and the Next.js and native binding versions both match `16.5.0-canary.27`. This is a runtime dependency incompatibility, rather than stale framework build output. Direct JWT loading succeeds on Node.js 20.20.2 and 24.22.1. The unchanged Preview Mode suite passes in production with Node.js 20.20.2 and in development with Node.js 24.22.1; the unchanged multi-zone development suite also passes on Node.js 24.22.1. Use a runtime that includes the pnpm symlink/realpath fix and supports these dependencies, such as Node.js 24.22.1, when evaluating the complete local suite.

The Preview Mode assertions remain enabled. The oversized-data fixture accepts only an error describing the documented 2 KB limit; unrelated errors propagate, so dependency initialization failures cannot pass as size-limit coverage.

## Scope of these findings

These observations are about the current reference server. They do not establish behavior of the Go replacement, other deployment topologies, or unsupported configuration combinations. The capability manifest remains the index of documentation and tests; this note does not mark a case as passing or introduce a known-failure gate.
