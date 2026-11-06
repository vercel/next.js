# Next.js Server Routing Audit

This audit maps the current Next.js server routing paths and identifies a
compatibility-first route toward making `@next/routing` the shared route
resolution layer. It is an internal contributor artifact, not public
documentation and not an API commitment.

`@next/routing` is experimental and is documented as stabilizing with the
adapters API. Any migration from the current server resolver must preserve
`next dev`, `next start`, custom server, adapter, and standalone behavior unless
a separate proposal explicitly approves a behavior change.

## Baseline Findings

- `@next/routing` exists in `packages/next-routing` and exposes a URL/Header
  based `resolveRoutes()` API for adapters.
- Public adapter docs already describe using `@next/routing` with
  `onBuildComplete` routing data in
  `docs/01-app/03-api-reference/07-adapters/05-routing-with-next-routing.mdx`
  and route shape information in
  `docs/01-app/03-api-reference/07-adapters/10-routing-information.mdx`.
- The live `next` server does not import `@next/routing` today. The only
  current references are the package itself and adapter documentation.
- `next start`, `next dev`, and custom server all converge through
  `packages/next/src/server/lib/router-server.ts`.
- The live resolver in
  `packages/next/src/server/lib/router-utils/resolve-routes.ts` owns more than
  pure route matching. It mutates Node request headers and metadata, invokes
  middleware through the render server, checks filesystem outputs, handles
  `_next/data`, applies i18n metadata, sets RSC rewrite headers, and reports
  matched outputs back to `router-server.ts`.
- The `@next/routing` test baseline is green with
  `pnpm --filter @next/routing test`: 10 suites, 255 tests.
- Live resolver contract coverage lives in
  `test/unit/server-routing-equivalence/resolve-routes.test.ts` and exercises
  the main observable server-routing branches: custom headers, redirects,
  before/after/fallback rewrites, external rewrites, dynamic routes, i18n,
  basePath, `_next/data`, export path map routes, `minimalMode`, invoked output
  skips, RSC rewrite headers, upgrade metadata, on-match headers, and
  middleware response translation.

## Entrypoint Map

| Surface                     | Current path                                                                                                       | Main responsibilities                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next start`                | `packages/next/src/cli/next-start.ts` -> `startServer()` -> `getRequestHandlers()` -> `router-server.initialize()` | Production CLI option parsing, reserved port checks, Node inspector setup, HTTP listener setup, production routing/rendering.                                                                                                                           |
| `next dev`                  | `packages/next/src/cli/next-dev.ts` -> child process -> `startServer()` -> `router-server.initialize()`            | Dev CLI orchestration, restart handling, trace/telemetry, bundler selection, HTTPS dev server setup, HMR and dev overlay integration.                                                                                                                   |
| Programmatic `next()`       | `packages/next/src/server/next.ts`                                                                                 | Public custom-server wrapper. `NextCustomServer.prepare()` calls `getRequestHandlers()` and routes `getRequestHandler()`, `render()`, and upgrades through the same router server.                                                                      |
| Default server wrapper      | `packages/next/src/server/next.ts` -> `NextServer` -> `next-server.ts`                                             | Wrapper used by `next start` style APIs and render worker initialization. Preserves legacy methods such as `render`, `renderToHTML`, `renderError`, `render404`, and `revalidate`.                                                                      |
| Router server               | `packages/next/src/server/lib/router-server.ts`                                                                    | Shared serverful request and upgrade coordinator. Loads config, builds filesystem checks, initializes dev bundler, initializes render server, filters internal headers, runs routing, serves static files, invokes render, and handles fallback errors. |
| Render server               | `packages/next/src/server/lib/render-server.ts`                                                                    | Lazy bridge from the router server into `NextServer` / `NextDevServer` request handling. Owns render-worker style initialization and request handler metadata.                                                                                          |
| Production render core      | `packages/next/src/server/next-server.ts` and `packages/next/src/server/base-server.ts`                            | Rendering, cache behavior, route module invocation, minimal-mode behavior, image handling, API/page/app route execution, error rendering, and custom-server compatibility methods.                                                                      |
| Upgrade requests            | `router-server.ts` upgrade handler                                                                                 | Handles dev HMR upgrades first, then routes possible proxy upgrade requests. Page/app WebSocket handling is still intentionally not claimed by the router server.                                                                                       |
| Standalone/minimal/adapters | `next.ts`, `base-server.ts`, build adapter docs and build outputs                                                  | Standalone output uses generated server output instead of `next start`; `minimalMode` changes routing/render assumptions; adapters consume build-time routing output and may invoke entrypoints directly.                                               |

The important maintenance point is that the serverful path already has one
shared coordinator, `router-server.ts`, but its responsibilities are broader
than routing. A minimal future server should preserve that coordinator role
while moving pure route resolution out of it.

## Request Flow Today

The serverful request path in `router-server.ts` currently follows this shape:

1. Initialize process state, load config, run `setupFsCheck()`, optionally set up
   the dev bundler, then initialize the render server.
2. For each request, attach request metadata, filter internal headers, run i18n
   locale detection redirects, set up compression, and run dev-only hot reloader
   handling.
3. Call the live `getResolveRoutes()` resolver with the Node request/response,
   filesystem checker, render server, config, and optional middleware ensure
   hook.
4. Apply route response headers, redirects, middleware body responses, external
   proxy rewrites, static asset serving, matched output rendering, and final
   404/500 fallback rendering.
5. For upgrade requests, first offer the request to HMR in dev, then reuse route
   resolution to detect external proxy rewrites.

This makes `router-server.ts` the correct place for an adoption seam, but not
the right long-term home for the route matching algorithm itself.

## Responsibility Map

| Responsibility                            | Current owner                                                                   | Compatibility constraint                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP/HTTPS listener and graceful shutdown | `start-server.ts`                                                               | Must keep current CLI startup, retry, signal, and logging behavior.                                                                                    |
| Internal header filtering                 | `router-server.ts` and `server-ipc/utils.ts`                                    | Security-sensitive. New internal headers must be filtered before any server code trusts them.                                                          |
| Request URL and metadata normalization    | `router-server.ts`, `resolve-routes.ts`, `request-meta.ts`                      | `initURL`, `initQuery`, `initProtocol`, locale, data request, middleware, and invoke metadata are observable by render internals.                      |
| Route matching phases                     | `router-utils/resolve-routes.ts` plus `filesystem.ts` route data                | Candidate for `@next/routing`, but only after equivalent phase ordering is proven.                                                                     |
| Filesystem/output lookup                  | `router-utils/filesystem.ts`                                                    | Needs a stable interface for public files, static files, app/pages files, data routes, dev virtual files, and dynamic routes.                          |
| Middleware invocation                     | `resolve-routes.ts` via render server                                           | `@next/routing` can model middleware results, but live invocation still needs Node request cloning, response capture, dev timing, and header mutation. |
| Static asset serving                      | `router-server.ts` with `serveStatic()`                                         | Must preserve cache-control, method handling, conflicting public/page file errors, and static 404 short-circuits.                                      |
| Rendering                                 | `router-server.ts` -> `render-server.ts` -> `next-server.ts` / `base-server.ts` | Route resolution must continue to produce the same `invokePath`, `invokeQuery`, `invokeOutput`, and status metadata.                                   |
| Error fallback                            | `router-server.ts`, `next-server.ts`, `base-server.ts`                          | Must preserve `NoFallbackError`, 400 decode errors, 404 app not-found routing, and 500 fallback behavior.                                              |
| Dev-only behavior                         | `setup-dev-bundler.ts`, hot reloaders, `next-dev-server.ts`                     | HMR, dev virtual FS items, overlay, dev logging, and ensure-before-render behavior should migrate last.                                                |
| Custom server compatibility               | `next.ts` wrapper and public methods                                            | `getRequestHandler()`, `render()`, `renderToHTML()`, `renderError()`, `render404()`, and `revalidate()` must stay compatible.                          |
| Adapter behavior                          | `@next/routing` docs and build adapter outputs                                  | The package is already adapter-facing; server adoption should reduce divergence, not force adapter API churn.                                          |

## Resolver Comparison

The live resolver is exported as `getResolveRoutes()` from
`packages/next/src/server/lib/router-utils/resolve-routes.ts`. The package
resolver is exported as `resolveRoutes()` from
`packages/next-routing/src/resolve-routes.ts`.

Shared concepts:

- Both model the same high-level phase order: before-middleware work,
  middleware, before-files rewrites, filesystem/static matching,
  after-files rewrites, dynamic route matching, on-match headers, and fallback
  rewrites.
- Both handle redirects, rewrites, route headers, has/missing conditions,
  external rewrite detection, dynamic route params, i18n, basePath, and
  `_next/data` normalization.
- Both need route data that is already available from manifests or
  `setupFsCheck()`.

Important differences before live adoption:

- The live resolver accepts and mutates `IncomingMessage` and `ServerResponse`.
  `@next/routing` accepts `URL`, `Headers`, `ReadableStream`, route arrays, and
  a middleware callback.
- The live resolver returns `matchedOutput` from `fsChecker.getItem()`.
  `@next/routing` returns a resolved pathname, query, invocation target,
  headers, route matches, redirects, or external rewrites.
- The live resolver directly invokes middleware through the render server and
  translates middleware response headers into Node request/response mutation.
  `@next/routing` delegates middleware execution to `invokeMiddleware()`.
- The live resolver has dev-specific behavior: middleware ensure hooks, dev
  timing metadata, dev virtual FS items, dynamic page/app ensure callbacks, and
  Turbopack test deployment-id checks.
- The live resolver coordinates with `fsChecker` for public/static files,
  app/page outputs, dynamic routes, `exportPathMap`, locales, and data routes.
  `@next/routing` needs a server adapter layer that supplies equivalent
  pathnames and route arrays and maps the result back to `FsOutput`.
- The live resolver sets framework-specific response headers for RSC rewrites
  (`NEXT_REWRITTEN_PATH_HEADER` and `NEXT_REWRITTEN_QUERY_HEADER`) under
  specific safety checks.

The migration should therefore avoid a direct file replacement. The safer target
is a small server adapter that converts live server state into `@next/routing`
inputs, invokes it, then maps the result back into the existing
`router-server.ts` contract.

## Compatibility Risk Inventory

- i18n: Locale detection redirects, domain locales, default-locale internal
  prefixing, API route locale stripping, and locale metadata must stay byte
  compatible with current render behavior.
- `basePath` and `assetPrefix`: Both are stripped or reapplied in different
  phases for dev bundler, static assets, HMR, and route matching.
- `_next/data`: Data URL normalization affects middleware matching, dynamic
  route matching, locale handling, and `x-nextjs-data` metadata.
- Middleware headers: Override headers, request header mutation,
  `x-middleware-set-cookie`, refresh behavior, non-redirect `Location`, and
  external rewrites are observable and security-sensitive.
- Rewrites, redirects, and headers: Phase ordering, status handling, query
  merging, set-cookie accumulation, and route condition captures need golden
  coverage.
- Dynamic routes: Matching must preserve data routes, route params, dynamic
  fallback behavior, and app-dir locale exclusions.
- Static assets: Public, legacy static, `.next/static`, metadata routes,
  immutable cache-control, method handling, and static 404 behavior are not pure
  route resolution.
- `minimalMode`: Current server internals intentionally skip custom routes and
  normalize some request forms differently. Treat this as a separate mode in
  tests.
- Standalone output: `next start` warns for `output: 'standalone'`; generated
  standalone server output has different deployment assumptions.
- Custom server APIs: Programmatic `next()` must keep the same request handler,
  upgrade handler, and legacy render methods.
- HMR upgrades: Dev HMR path handling depends on `basePath`/`assetPrefix` and
  should stay in `router-server.ts` until routing equivalence is proven.
- Adapter routing outputs: `@next/routing` is already an adapter contract. Live
  server adoption should use the same route shapes where possible and should not
  require adapter-facing churn.

## Staged Migration Recommendation

1. Build equivalence fixtures around the current live resolver before changing
   behavior. Keep expanding the contract suite until every live resolver branch
   and mode-specific edge case has a fixture, including redirects, headers,
   before/after/fallback rewrites, middleware rewrites and redirects, i18n,
   basePath, `_next/data`, dynamic routes, static assets, minimalMode, invoked
   outputs, upgrade requests, and proxy rewrites.
2. Add a translation layer that converts `fsChecker` and manifest-backed data
   into the `@next/routing` route shape and maps `@next/routing` results back to
   the existing `router-server.ts` result shape.
3. Delegate a narrow production path first, preferably route phases that do not
   invoke middleware or depend on dev-only ensure behavior.
4. Expand to production middleware once middleware response translation has
   golden coverage against the current Node mutation behavior.
5. Expand to dev paths last, including dev virtual files, page/app ensure,
   HMR-adjacent behavior, and dev overlay timing metadata.
6. Delete legacy route-resolution branches only after the equivalent
   `@next/routing` path is default, covered in both webpack and Turbopack modes,
   and no longer needed by minimal/custom-server flows.

## Non-Goals For This Milestone

- Do not change `next dev`, `next start`, custom server, standalone, minimal
  mode, or adapter behavior.
- Do not mark `@next/routing` stable.
- Do not remove legacy route branches or bypass `router-server.ts`.
- Do not change public types, manifests, route output shape, or adapter docs
  beyond future separately reviewed work.

## Verification Notes

- Re-run `pnpm --filter @next/routing test` after changes that affect
  `packages/next-routing`.
- Re-run
  `pnpm testonly test/unit/server-routing-equivalence/resolve-routes.test.ts`
  after changes that affect the live server resolver contract.
- For live server adoption work, run focused start/dev tests in both webpack and
  Turbopack modes, matching CI environment variables when reproducing failures.
- Treat this audit as a map for future implementation PRs, not as sufficient
  proof for deleting existing compatibility paths.
