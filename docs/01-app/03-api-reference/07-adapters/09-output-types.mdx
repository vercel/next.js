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

For any route output with `runtime: 'edge'`, `edgeRuntime` is included and contains the canonical entry metadata for invoking that output in your edge runtime.

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
  wasmAssets?: Record<string, string>  // Bundled wasm files (key: name, value: absolute path)
  edgeRuntime?: {
    modulePath: string    // Absolute path to the module registered in the edge runtime
    entryKey: string      // Canonical key used by the edge entry registry
    handlerExport: string // Export name to invoke, currently 'handler'
  }
  config: {
    maxDuration?: number  // Maximum duration of the route in seconds
    preferredRegion?: string | string[]  // Preferred deployment region
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
  wasmAssets?: Record<string, string>  // Bundled wasm files (key: name, value: absolute path)
  edgeRuntime?: {
    modulePath: string    // Absolute path to the module registered in the edge runtime
    entryKey: string      // Canonical key used by the edge entry registry
    handlerExport: string // Export name to invoke, currently 'handler'
  }
  config: {
    maxDuration?: number  // Maximum duration of the route in seconds
    preferredRegion?: string | string[]  // Preferred deployment region
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
  wasmAssets?: Record<string, string>  // Bundled wasm files (key: name, value: absolute path)
  edgeRuntime?: {
    modulePath: string    // Absolute path to the module registered in the edge runtime
    entryKey: string      // Canonical key used by the edge entry registry
    handlerExport: string // Export name to invoke, currently 'handler'
  }
  config: {
    maxDuration?: number  // Maximum duration of the route in seconds
    preferredRegion?: string | string[]  // Preferred deployment region
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
  wasmAssets?: Record<string, string>  // Bundled wasm files (key: name, value: absolute path)
  edgeRuntime?: {
    modulePath: string    // Absolute path to the module registered in the edge runtime
    entryKey: string      // Canonical key used by the edge entry registry
    handlerExport: string // Export name to invoke, currently 'handler'
  }
  config: {
    maxDuration?: number  // Maximum duration of the route in seconds
    preferredRegion?: string | string[]  // Preferred deployment region
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

## Static Files (`outputs.staticFiles`)

Static assets and auto-statically optimized pages:

```typescript
{
  type: 'STATIC_FILE'
  id: string // Route identifier
  filePath: string // Path to the built file
  pathname: string // URL pathname
  immutableHash: string | undefined // Content hash when the filename contains a hash, indicating the file is immutable
}
```

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
  wasmAssets?: Record<string, string>  // Bundled wasm files (key: name, value: absolute path)
  edgeRuntime?: {
    modulePath: string    // Absolute path to the module registered in the edge runtime
    entryKey: string      // Canonical key used by the edge entry registry
    handlerExport: string // Export name to invoke, currently 'handler'
  }
  config: {
    maxDuration?: number  // Maximum duration of the route in seconds
    preferredRegion?: string | string[]  // Preferred deployment region
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
