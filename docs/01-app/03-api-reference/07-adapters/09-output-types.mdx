---
title: Output Types
description: Reference for all build output types exposed to adapters.
---

The `outputs` object contains arrays of build output types:

- `outputs.pages`: React pages from the `pages/` directory
- `outputs.pagesApi`: API routes from `pages/api/`
- `outputs.appPages`: React pages from the `app/` directory
- `outputs.appRoutes`: API and metadata routes from `app/`
- `outputs.prerenders`: ISR-enabled routes and static prerenders
- `outputs.staticFiles`: Static assets and auto-statically optimized pages
- `outputs.middleware`: Middleware function (if present)

> **Note:** When `config.output` is set to `'export'`, only `outputs.staticFiles` is populated. All other arrays (`pages`, `appPages`, `pagesApi`, `appRoutes`, `prerenders`) will be empty since the entire application is exported as static files.

For any route output with `runtime: 'edge'`, `edgeRuntime` is included and contains the canonical entry metadata for invoking that output in your edge runtime. Note that the Edge Runtime is [deprecated](/docs/messages/edge-runtime-deprecated).

## Pages (`outputs.pages`)

React pages from the `pages/` directory:

```typescript
{
  type: 'PAGES'
  id: string           // Route identifier
  filePath: string     // Path to the built file
  pathname: string     // URL pathname
  sourcePage: string   // Original source file path in pages/ directory
  runtime: 'nodejs' | 'edge'
  assets: Record<string, string>  // Traced dependencies (key: relative path from repo root, value: absolute path)
  assetsHashes: Record<string, string>  // Content hashes of each `assets` entry (key: same as `assets`, value: content hash)
  wasmAssets?: Record<string, string>  // Bundled wasm files (key: name, value: absolute path)
  edgeRuntime?: {
    modulePath: string    // Absolute path to the module registered in the edge runtime
    entryKey: string      // Canonical key used by the edge entry registry
    handlerExport: string // Export name to invoke, currently 'handler'
  }
  config: {
    maxDuration?: number  // Maximum duration of the route in seconds
    preferredRegion?: string | string[]  // Preferred deployment region (deprecated)
    env?: Record<string, string>  // Environment variables (edge runtime only)
  }
}
```

## API Routes (`outputs.pagesApi`)

API routes from `pages/api/`:

```typescript
{
  type: 'PAGES_API'
  id: string           // Route identifier
  filePath: string     // Path to the built file
  pathname: string     // URL pathname
  sourcePage: string   // Original relative source file path
  runtime: 'nodejs' | 'edge'
  assets: Record<string, string>  // Traced dependencies (key: relative path from repo root, value: absolute path)
  assetsHashes: Record<string, string>  // Content hashes of each `assets` entry (key: same as `assets`, value: content hash)
  wasmAssets?: Record<string, string>  // Bundled wasm files (key: name, value: absolute path)
  edgeRuntime?: {
    modulePath: string    // Absolute path to the module registered in the edge runtime
    entryKey: string      // Canonical key used by the edge entry registry
    handlerExport: string // Export name to invoke, currently 'handler'
  }
  config: {
    maxDuration?: number  // Maximum duration of the route in seconds
    preferredRegion?: string | string[]  // Preferred deployment region (deprecated)
    env?: Record<string, string>  // Environment variables (edge runtime only)
  }
}
```

## App Pages (`outputs.appPages`)

React pages from the `app/` directory:

```typescript
{
  type: 'APP_PAGE'
  id: string           // Route identifier
  filePath: string     // Path to the built file
  pathname: string     // URL pathname. Includes .rsc suffix for RSC routes
  sourcePage: string   // Original relative source file path
  runtime: 'nodejs' | 'edge' // Runtime the route is built for
  assets: Record<string, string>  // Traced dependencies (key: relative path from repo root, value: absolute path)
  assetsHashes: Record<string, string>  // Content hashes of each `assets` entry (key: same as `assets`, value: content hash)
  wasmAssets?: Record<string, string>  // Bundled wasm files (key: name, value: absolute path)
  edgeRuntime?: {
    modulePath: string    // Absolute path to the module registered in the edge runtime
    entryKey: string      // Canonical key used by the edge entry registry
    handlerExport: string // Export name to invoke, currently 'handler'
  }
  config: {
    maxDuration?: number  // Maximum duration of the route in seconds
    preferredRegion?: string | string[]  // Preferred deployment region (deprecated)
    env?: Record<string, string>  // Environment variables (edge runtime only)
  }
}
```

## App Routes (`outputs.appRoutes`)

API and metadata routes from the `app/` directory:

```typescript
{
  type: 'APP_ROUTE'
  id: string           // Route identifier
  filePath: string     // Path to the built file
  pathname: string     // URL pathname
  sourcePage: string   // Original relative source file path
  runtime: 'nodejs' | 'edge' // Runtime the route is built for
  assets: Record<string, string>  // Traced dependencies (key: relative path from repo root, value: absolute path)
  assetsHashes: Record<string, string>  // Content hashes of each `assets` entry (key: same as `assets`, value: content hash)
  wasmAssets?: Record<string, string>  // Bundled wasm files (key: name, value: absolute path)
  edgeRuntime?: {
    modulePath: string    // Absolute path to the module registered in the edge runtime
    entryKey: string      // Canonical key used by the edge entry registry
    handlerExport: string // Export name to invoke, currently 'handler'
  }
  config: {
    maxDuration?: number  // Maximum duration of the route in seconds
    preferredRegion?: string | string[]  // Preferred deployment region (deprecated)
    env?: Record<string, string>  // Environment variables (edge runtime only)
  }
}
```

## Prerenders (`outputs.prerenders`)

ISR-enabled routes and static prerenders:

```typescript
{
  type: 'PRERENDER'
  id: string           // Route identifier
  pathname: string     // URL pathname
  parentOutputId: string  // ID of the source page/route
  groupId: number        // Revalidation group identifier (prerenders with same groupId revalidate together)
  route: string           // Source route matcher aligned with the filesystem route, keeping dynamic segments (e.g. /blog/[slug] for the prerendered path /blog/first)
  routeType?: 'route' | 'fallback' | 'shell' | 'page'  // Kind of canonical response
  response?: 'empty' | 'initial' | 'complete'  // Completeness before request-time work
  compute?: 'blocking' | 'resuming' | 'static'  // Request-time compute needed for the completed response
  htmlSize?: number       // Byte size of the prerendered App Router HTML shell
  pprChain?: {
    headers: Record<string, string>  // PPR chain headers (e.g., 'next-resume': '1')
  }
  parentFallbackMode?: false | null | string  // false: no additional paths (fallback: false), null: blocking render, string: path to HTML fallback
  fallback?: {
    filePath: string | undefined  // Path to the fallback file (HTML, JSON, or RSC)
    initialStatus?: number  // Initial status code
    initialHeaders?: Record<string, string | string[]>  // Initial headers
    initialExpiration?: number  // Initial expiration time in seconds
    initialRevalidate?: number | false  // Initial revalidate time in seconds, or false for fully static
    postponedState: string | undefined  // Serialized PPR state used for resuming rendering
  }
  config: {
    allowQuery?: string[]     // Allowed query parameters considered for the cache key
    allowHeader?: string[]    // Allowed headers for ISR
    bypassFor?: RouteHas[]    // Cache bypass conditions
    renderingMode?: 'STATIC' | 'PARTIALLY_STATIC'  // STATIC: fully static, PARTIALLY_STATIC: PPR-enabled
    partialFallback?: boolean  // Serves a partial fallback shell that should be upgraded to a full route in the background
    bypassToken?: string      // Generated token that signals the prerender cache should be bypassed
  }
}
```

### Prerender classification

`routeType`, `response`, and `compute` are emitted together on the primary response in a prerender group. Related RSC, data, and segment outputs omit these fields. Pages Router templates with `fallback: false` also omit them because those templates are never served for unmatched URLs.

`routeType` identifies the kind of canonical response:

- `route`: a non-UI route, such as a Route Handler
- `page`: a page whose URL has no missing prerenderable parameters
- `shell`: the most specific reusable page shell for its class of URLs
- `fallback`: a reusable page response that can be specialized by filling more prerenderable parameters

`response` describes how complete the response is before request-time work:

- `empty`: no initial page response can be served
- `initial`: an initial response can be served, but it is not the completed page UI. In practice, this only applies to UI routes that are partially prerenderable
- `complete`: the response is complete; this can include a zero-byte response body, such as a `204` Route Handler response

`compute` describes the request-time compute needed to serve the completed response:

- `blocking`: no initial response can be sent before request-time compute starts; once started, the response can stream while compute continues
- `resuming`: an initial response is served while postponed work resumes on the server
- `static`: no server compute is required per request

`htmlSize` is only included on the primary App Router HTML output. A value of `0` means that the HTML shell is empty. Pages Router prerenders, Route Handlers, and related RSC, data, and segment outputs omit it.

## Static Files (`outputs.staticFiles`)

Static assets and auto-statically optimized pages:

```typescript
{
  type: 'STATIC_FILE'
  id: string // Unique identifier for this static file output
  filePath: string // Absolute filesystem path to the built file
  pathname: string // The routable URL pathname for this static file
  immutableHash: string | undefined // Content hash when the filename contains a hash, indicating the file is immutable
}
```

See [Supporting immutable static assets](/docs/app/api-reference/adapters/immutable-static-assets) for more information about `immutableHash`.

## Middleware (`outputs.middleware`)

`middleware.ts` (`.js`/`.ts`) or `proxy.ts` (`.js`/`.ts`) function (if present):

```typescript
{
  type: 'MIDDLEWARE'
  id: string           // Route identifier
  filePath: string     // Path to the built file
  pathname: string      // Always '/_middleware'
  sourcePage: string    // Always 'middleware'
  runtime: 'nodejs' | 'edge' // Runtime the route is built for
  assets: Record<string, string>  // Traced dependencies (key: relative path from repo root, value: absolute path)
  assetsHashes: Record<string, string>  // Content hashes of each `assets` entry (key: same as `assets`, value: content hash)
  wasmAssets?: Record<string, string>  // Bundled wasm files (key: name, value: absolute path)
  edgeRuntime?: {
    modulePath: string    // Absolute path to the module registered in the edge runtime
    entryKey: string      // Canonical key used by the edge entry registry
    handlerExport: string // Export name to invoke, currently 'handler'
  }
  config: {
    maxDuration?: number  // Maximum duration of the route in seconds
    preferredRegion?: string | string[]  // Preferred deployment region (deprecated)
    env?: Record<string, string>  // Environment variables (edge runtime only)
    matchers?: Array<{
      source: string  // Source pattern
      sourceRegex: string  // Compiled regex for matching requests
      has: RouteHas[] | undefined  // Positive matching conditions
      missing: RouteHas[] | undefined  // Negative matching conditions
    }>
  }
}
```
