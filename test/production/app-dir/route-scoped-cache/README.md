# Route-scoped response cache regression tests

These tests specify the alternative to the route-rematching guard. A request
accepted by a route must be able to read and write that route's own response
cache, even when another route produces the same legacy pathname key. Returning
500 for the colliding request does not satisfy these tests.

The suites are intentionally added before the implementation. On the unmodified
baseline, ordinary behavior must pass and the affected isolation cases must
fail with wrong-owner content, a shared negative entry, an overwritten static
page, or a missing route-qualified custom-handler key. Some cross-router cases
already pass because existing filesystem namespaces separate them; those cases
also provide regression coverage.

## Coverage

| Suite | Coverage |
| --- | --- |
| `route-scoped-cache.test.ts` | Default memory + disk, disk-only, and a recording custom handler; Pages, App Pages, Route Handlers, i18n, prebuilt responses, runtime responses, misses/hits, concurrent requests, restart persistence, cached redirects and 404s, fallback admission, ISR lifetimes, on-demand and only-generated revalidation, HTML/data/RSC, rewrites, query strings, trailing slashes, encoded slash/percent/Unicode/space parameters, static HTML, public files |
| `../route-scoped-cache-ppr/route-scoped-cache-ppr.test.ts` | Build-time and runtime PPR shells, partial shells, parameter variants, dynamic resumption, RSC navigation, full/segment prefetch, lifetime and tag/path revalidation, cross-route collisions, intentionally shared `use cache` data |
| `../route-scoped-cache-standalone/route-scoped-cache-standalone.test.ts` | Standalone distribution copied outside the build tree, prebuilt assets, runtime disk persistence, on-demand revalidation and collisions; direct compiled-handler invocation in simulated minimal mode |
| `../../route-scoped-cache-export/route-scoped-cache-export.test.ts` | `output: 'export'` with trailing slashes on/off and a base path; exact public HTML/JSON/RSC/body paths, Unicode/space/index/nested paths, 404s, assets, links and HTTP serving by a plain static server |

Each collision is exercised with the encoded request first and the canonical
request first, including build-time entries. The `/index` and Unicode cases
also constrain compatibility: a route accepted by routing must continue to
render successfully rather than inheriting the guard's 500 response.

The custom handler treats keys as opaque and delegates existing serialization,
expiration and tag behavior to the existing filesystem handler. Its recording
assertions require distinct keys for the same legacy pathname, a fixed-length
source hash and a readable pathname. A long Unicode route group exercises both
build-time prerenders and runtime writes without exceeding filename limits.

The export server models a static server's `try_files $uri.html` behavior because
an App route may have both `known.html` and a `known/` segment-payload directory.
The export App fixture decodes its displayed slug; the baseline export renderer
can supply URI-encoded parameters. Filesystem and HTTP assertions still verify
the actual Unicode and space-containing public paths.

The classic suite also exercises `trailingSlash: true` both with and without
redirects. Prebuilt and runtime-created entries must retain their normal cache
lifetime and hit behavior in both configurations.

A closed Pages catch-all must honor its own `getStaticPaths` allowlist, even
when a sibling prerendered the same decoded pathname.
The admission regressions cover positive and negative sibling entries, HTML and
data requests, and both locales while preserving the catch-all's own allowlist.
Direct compiled-handler checks exercise the same rule in minimal mode.

App Route Handlers must likewise enforce their own generated parameter lists.
App Pages are checked through HTML and RSC requests as well. Dynamic App Pages
and Route Handlers must keep rendering dynamically when a sibling owns a
prerender at the same decoded pathname; foreign metadata must not classify them
as static or supply their prefetch metadata.

## Cache identity and build compatibility

Response keys contain the response kind, the SHA-256 hash of the source route,
and the normalized request pathname. Pages use `definition.pathname` so index
modules have the same identity in both bundlers; App routes use the full
`definition.page`, including groups and slots. The hash occupies
one 64-character directory, with `$` separating it from the readable pathname.
For example, `/blog/post` rendered by `/blog/[slug]` uses
`/route-cache/PAGES/<sha256-of-/blog/[slug]>/$/blog/post`. Node and Edge produce
the same hash from the source's UTF-8 bytes. No route-description file is emitted.
Hashing bounds the added source namespace; request pathnames and PPR segment
paths retain their existing filesystem limits.
Custom handlers must preserve the entire opaque key. Fetch and image keys are
unchanged; image caching has an explicit context without a response-route owner.

The full source module identity includes route groups and parallel slots.
Prerender ownership comes from the existing `srcRoute` and `fallbackSourceRoute`
metadata, with locale normalization for static Pages entries. These fields use
the normalized source route, so the matched App module is normalized only for
this metadata check. Storage hashes include the full source module identity.
No additional per-path cache-key mapping is emitted in the prerender manifest.

Without a build adapter, build-time response artifacts retain their historical
`server/pages` and `server/app` locations. Their metadata records the exact
scoped key, source owner and fallback status that produced the immutable build
seed. Runtime regeneration writes only to `server/route-cache`; it never
updates the historical artifact. With an adapter configured, build-time
responses are written directly to scoped `server/route-cache` keys so
colliding routes stay isolated before packaging. Static `output: 'export'`
continues to emit normal public files.

The filesystem cache checks the scoped entry first. Only when its primary file
is absent may it admit a historical seed whose metadata exactly matches the
requested key and owner. A successful read promotes every payload into the
scoped location without deleting the build artifact and preserves the seed's
original age. The built-in filesystem publishes the primary scoped payload
with an atomic no-replace operation after writing its ancillary files. This
keeps an interrupted promotion retryable and avoids replacing a newer primary;
the ancillary files retain the cache's existing multi-file write semantics.
Custom handlers continue to receive only opaque scoped keys and are never
queried with the historical pathname.

## Deployment behavior

The classic and PPR HTTP suites retain deployment coverage. Vercel already
isolates cache entries by selected route, and may normalize encoded aliases
before invocation. Those assertions permit the platform's selected owner while
requiring the canonical route to keep its own content. Vercel can also terminate
an unlisted fallback-false route with 404 at a function boundary. Exact local
cache headers, process restart, and custom-handler recordings are asserted
locally; deployment branches assert the corresponding public response behavior.

Standalone packaging, simulated trusted adapter metadata, and exported-file
inspection are inherently local assertions. Those two suite files explicitly
exclude deploy mode. The minimal-mode harness does not claim to reproduce the
entire Vercel deployment pipeline.

## Running

Run all four files with `pnpm test-start-webpack` and `pnpm test-start-turbo`.
Use the normal isolated-package harness for packaging validation, especially
standalone. The tests use real fixtures, public HTTP requests and generated
artifacts; they do not modify compiled framework code or depend on a proposed
cache layout.
