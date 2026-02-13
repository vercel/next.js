---
title: adapterPath
description: Configure a custom adapter for Next.js to hook into the build process with modifyConfig and onBuildComplete callbacks.
version: experimental
---

Next.js provides an experimental API that allows you to create custom adapters to hook into the build process. This is useful for deployment platforms or custom build integrations that need to modify Next.js configuration or process build outputs.

For a full reference implementation, see [`nextjs/adapter-vercel`](https://github.com/nextjs/adapter-vercel).

## Configuration

To use an adapter, specify the path to your adapter module in `experimental.adapterPath`:

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    adapterPath: require.resolve('./my-adapter.js'),
  },
}

module.exports = nextConfig
```

## Creating an Adapter

An adapter is a module that exports an object implementing the `NextAdapter` interface:

```typescript
type Route = {
  source?: string
  sourceRegex: string
  destination?: string
  headers?: Record<string, string>
  has?: RouteHas[]
  missing?: RouteHas[]
  status?: number
  priority?: boolean
}

export interface AdapterOutputs {
  pages: Array<AdapterOutput['PAGES']>
  middleware?: AdapterOutput['MIDDLEWARE']
  appPages: Array<AdapterOutput['APP_PAGE']>
  pagesApi: Array<AdapterOutput['PAGES_API']>
  appRoutes: Array<AdapterOutput['APP_ROUTE']>
  prerenders: Array<AdapterOutput['PRERENDER']>
  staticFiles: Array<AdapterOutput['STATIC_FILE']>
}

export interface NextAdapter {
  name: string
  modifyConfig?: (
    config: NextConfigComplete,
    ctx: {
      phase: PHASE_TYPE
    }
  ) => Promise<NextConfigComplete> | NextConfigComplete
  onBuildComplete?: (ctx: {
    routing: {
      beforeMiddleware: Array<Route>
      beforeFiles: Array<Route>
      afterFiles: Array<Route>
      dynamicRoutes: Array<Route>
      onMatch: Array<Route>
      fallback: Array<Route>
      shouldNormalizeNextData: boolean
      rsc: RoutesManifest['rsc']
    }
    outputs: AdapterOutputs
    projectDir: string
    repoRoot: string
    distDir: string
    config: NextConfigComplete
    nextVersion: string
    buildId: string
  }) => Promise<void> | void
}
```

### Basic Adapter Structure

Here's a minimal adapter example:

```js filename="my-adapter.js"
/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'my-custom-adapter',

  async modifyConfig(config, { phase }) {
    // Modify the Next.js config based on the build phase
    if (phase === 'phase-production-build') {
      return {
        ...config,
        // Add your modifications
      }
    }
    return config
  },

  async onBuildComplete({
    routing,
    outputs,
    projectDir,
    repoRoot,
    distDir,
    config,
    nextVersion,
    buildId,
  }) {
    // Process the build output
    console.log('Build completed with', outputs.pages.length, 'pages')
    console.log('Build ID:', buildId)
    console.log('Dynamic routes:', routing.dynamicRoutes.length)

    // Access emitted output entries
    for (const page of outputs.pages) {
      console.log('Page:', page.pathname, 'at', page.filePath)
    }

    for (const apiRoute of outputs.pagesApi) {
      console.log('API Route:', apiRoute.pathname, 'at', apiRoute.filePath)
    }

    for (const appPage of outputs.appPages) {
      console.log('App Page:', appPage.pathname, 'at', appPage.filePath)
    }

    for (const prerender of outputs.prerenders) {
      console.log('Prerendered:', prerender.pathname)
    }
  },
}

module.exports = adapter
```

## API Reference

### `modifyConfig(config, context)`

Called for any CLI command that loads the next.config to allow modification of the configuration.

**Parameters:**

- `config`: The complete Next.js configuration object
- `context.phase`: The current build phase (see [phases](/docs/app/api-reference/config/next-config-js#phase))

**Returns:** The modified configuration object (can be async)

### `onBuildComplete(context)`

Called after the build process completes with detailed information about routes and outputs.

**Parameters:**

- `routing`: Object containing Next.js routing phases and metadata
  - `routing.beforeMiddleware`: Routes executed before middleware (includes header and redirect handling)
  - `routing.beforeFiles`: Rewrite routes checked before filesystem route matching
  - `routing.afterFiles`: Rewrite routes checked after filesystem route matching
  - `routing.dynamicRoutes`: Dynamic route matching table
  - `routing.onMatch`: Routes applied after a successful match (for example immutable static asset cache headers)
  - `routing.fallback`: Final rewrite fallback routes
  - `routing.shouldNormalizeNextData`: Whether `/_next/data/<buildId>/...` URLs should be normalized during matching
  - `routing.rsc`: Route metadata used for React Server Components routing behavior
- `outputs`: Detailed information about all build outputs organized by type
- `projectDir`: Absolute path to the Next.js project directory
- `repoRoot`: Absolute path to the detected repository root
- `distDir`: Absolute path to the build output directory
- `config`: The final Next.js configuration (with `modifyConfig` applied)
- `nextVersion`: Version of Next.js being used
- `buildId`: Unique identifier for the current build

## Routing with `@next/routing`

You can use [`@next/routing`](https://www.npmjs.com/package/@next/routing) to reproduce Next.js route matching behavior with data from `onBuildComplete`.

> [!NOTE]
> `@next/routing` is experimental and will stabilize with the adapters API.

```typescript
import { resolveRoutes } from '@next/routing'

const pathnames = [
  ...outputs.pages,
  ...outputs.pagesApi,
  ...outputs.appPages,
  ...outputs.appRoutes,
  ...outputs.staticFiles,
].map((output) => output.pathname)

const result = await resolveRoutes({
  url: requestUrl,
  buildId,
  basePath: config.basePath || '',
  i18n: config.i18n,
  headers: requestHeaders,
  requestBody,
  pathnames,
  routes: routing,
  invokeMiddleware: async (ctx) => {
    // platform-specific middleware invocation
    return {}
  },
})
```

## Implementing PPR in an Adapter

For partially prerendered app routes, `onBuildComplete` gives you the data needed to seed and resume PPR:

- `outputs.prerenders[].fallback.filePath`: path to the generated fallback shell (for example HTML)
- `outputs.prerenders[].fallback.postponedState`: serialized postponed state used to resume rendering

### 1. Seed shell + postponed state at build time

```ts filename="my-adapter.ts"
import { readFile } from 'node:fs/promises'

async function seedPprEntries(outputs: AdapterOutputs) {
  for (const prerender of outputs.prerenders) {
    const fallback = prerender.fallback
    if (!fallback?.filePath || !fallback.postponedState) continue

    const shell = await readFile(fallback.filePath, 'utf8')
    await platformCache.set(prerender.pathname, {
      shell,
      postponedState: fallback.postponedState,
      initialHeaders: fallback.initialHeaders,
      initialStatus: fallback.initialStatus,
      initialRevalidate: fallback.initialRevalidate,
      initialExpiration: fallback.initialExpiration,
    })
  }
}
```

### 2. Runtime flow: serve cached shell and resume in background

At request time, you can stream a single response that is the concatenation of:

1. cached HTML shell stream
2. resumed render stream (generated after invoking `handler` with postponed state)

```text
Client
  | GET /ppr-route
  v
Adapter Router
  |
  |-- read cached shell + postponedState ---> Platform Cache
  |<------------- cache hit -----------------|
  |
  |-- create responseStream = concat(shellStream, resumedStream)
  |
  |-- start piping shellStream ------------> Client (first bytes)
  |
  |-- invoke handler(req, res, { requestMeta: { postponed } })
  |   -------------------------------------> Entrypoint (handler)
  |   <------------------------------------- resumed chunks/cache entry
  |
  |-- append resumed chunks to resumedStream
  |
  '-- client receives one HTTP response:
      [shell bytes........][resumed bytes........]
```

### 3. Update cache with `requestMeta.onCacheEntryV2`

`requestMeta.onCacheEntryV2` is called when a response cache entry is looked up or generated. Use it to persist updated shell/postponed data.

> [!NOTE]
>
> - `requestMeta.onCacheEntry` still works, but is deprecated.
> - Prefer `requestMeta.onCacheEntryV2`.
> - If your adapter uses an internal `onCacheCallback` abstraction, wire it to `requestMeta.onCacheEntryV2`.

```ts filename="my-adapter.ts"
await handler(req, res, {
  waitUntil,
  requestMeta: {
    postponed: cachedPprEntry?.postponedState,
    onCacheEntryV2: async (cacheEntry, meta) => {
      if (cacheEntry.value?.kind === 'APP_PAGE') {
        const html =
          cacheEntry.value.html &&
          typeof cacheEntry.value.html.toUnchunkedString === 'function'
            ? cacheEntry.value.html.toUnchunkedString()
            : null

        await platformCache.set(meta.url || req.url || '/', {
          shell: html,
          postponedState: cacheEntry.value.postponed,
          headers: cacheEntry.value.headers,
          status: cacheEntry.value.status,
          cacheControl: cacheEntry.cacheControl,
        })
      }

      // Return true only if your adapter already wrote the response itself.
      return false
    },
  },
})
```

```text
Entrypoint (handler)
  | onCacheEntryV2(cacheEntry, { url })
  v
requestMeta.onCacheEntryV2 callback
  |
  |-- if APP_PAGE ---> persist html + postponedState + headers ---> Platform Cache
  |
  '-- return false: continue normal Next.js response flow
      return true:  adapter already handled response (short-circuit)
```

## Invoking Entrypoints

Build output entrypoints now use a `handler(..., ctx)` interface, with runtime-specific request/response types.

### Node.js runtime (`runtime: 'nodejs'`)

Node entrypoints (see `packages/next/src/build/templates/app-page.ts`, `packages/next/src/build/templates/app-route.ts`, and `packages/next/src/build/templates/pages-api.ts`) use:

```typescript
handler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
    requestMeta?: RequestMeta
  }
): Promise<void>
```

### Edge runtime (`runtime: 'edge'`)

Edge entrypoints (see `packages/next/src/build/templates/edge-ssr.ts`, `packages/next/src/build/templates/edge-app-route.ts`, `packages/next/src/build/templates/pages-edge-api.ts`, and `packages/next/src/build/templates/middleware.ts`) use:

```typescript
handler(
  request: Request,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
    signal?: AbortSignal
    requestMeta?: RequestMeta
  }
): Promise<Response>
```

The shape is aligned around `handler(..., ctx)`, but node and edge runtimes use different request/response primitives.

## Output Types

The `outputs` object contains arrays of different output types:

### Pages (`outputs.pages`)

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
  config: {
    maxDuration?: number
    preferredRegion?: string | string[]
    env?: Record<string, string>  // Environment variables (edge runtime only)
  }
}
```

### API Routes (`outputs.pagesApi`)

API routes from `pages/api/`:

```typescript
{
  type: 'PAGES_API'
  id: string
  filePath: string
  pathname: string
  sourcePage: string   // Original relative source file path
  runtime: 'nodejs' | 'edge'
  assets: Record<string, string>
  wasmAssets?: Record<string, string>
  config: {
    maxDuration?: number
    preferredRegion?: string | string[]
    env?: Record<string, string>
  }
}
```

### App Pages (`outputs.appPages`)

React pages from the `app/` directory with `page.{js,ts,jsx,tsx}`:

```typescript
{
  type: 'APP_PAGE'
  id: string
  filePath: string
  pathname: string     // Includes .rsc suffix for RSC routes
  sourcePage: string   // Original relative source file path
  runtime: 'nodejs' | 'edge'
  assets: Record<string, string>
  wasmAssets?: Record<string, string>
  config: {
    maxDuration?: number
    preferredRegion?: string | string[]
    env?: Record<string, string>
  }
}
```

### App Routes (`outputs.appRoutes`)

API and metadata routes from `app/` with `route.{js,ts,jsx,tsx}`:

```typescript
{
  type: 'APP_ROUTE'
  id: string
  filePath: string
  pathname: string
  sourcePage: string
  runtime: 'nodejs' | 'edge'
  assets: Record<string, string>
  wasmAssets?: Record<string, string>
  config: {
    maxDuration?: number
    preferredRegion?: string | string[]
    env?: Record<string, string>
  }
}
```

### Prerenders (`outputs.prerenders`)

ISR-enabled routes and static prerenders:

```typescript
{
  type: 'PRERENDER'
  id: string
  pathname: string
  parentOutputId: string  // ID of the source page/route
  groupId: number        // Revalidation group identifier (prerenders with same groupId revalidate together)
  pprChain?: {
    headers: Record<string, string>  // PPR chain headers (e.g., 'x-nextjs-resume': '1')
  }
  parentFallbackMode?: DynamicPrerenderManifestRoute['fallback']
  fallback?: {
    filePath: string | undefined
    initialStatus?: number
    initialHeaders?: Record<string, string | string[]>
    initialExpiration?: number
    initialRevalidate?: number
    postponedState: string | undefined
  }
  config: {
    allowQuery?: string[]     // Allowed query parameters
    allowHeader?: string[]    // Allowed headers for ISR
    bypassFor?: RouteHas[]    // Cache bypass conditions
    renderingMode?: RenderingMode
    bypassToken?: string
  }
}
```

### Static Files (`outputs.staticFiles`)

Static assets and auto-statically optimized pages:

```typescript
{
  type: 'STATIC_FILE'
  id: string
  filePath: string
  pathname: string
}
```

### Middleware (`outputs.middleware`)

Middleware function (if present):

```typescript
{
  type: 'MIDDLEWARE'
  id: string
  filePath: string
  pathname: string      // Always '/_middleware'
  sourcePage: string    // Always 'middleware'
  runtime: 'nodejs' | 'edge'
  assets: Record<string, string>
  wasmAssets?: Record<string, string>
  config: {
    maxDuration?: number
    preferredRegion?: string | string[]
    env?: Record<string, string>
    matchers?: Array<{
      source: string
      sourceRegex: string
      has: RouteHas[] | undefined
      missing: RouteHas[] | undefined
    }>
  }
}
```

## Routing Information

The `routing` object in `onBuildComplete` provides complete routing information with processed patterns ready for deployment:

### `routing.beforeMiddleware`

Routes applied before middleware execution. These include generated header and redirect behavior.

### `routing.beforeFiles`

Rewrite routes checked before filesystem route matching.

### `routing.afterFiles`

Rewrite routes checked after filesystem route matching.

### `routing.dynamicRoutes`

Dynamic matchers generated from route segments such as `[slug]` and catch-all routes.

### `routing.onMatch`

Routes that apply after a successful match, such as immutable cache headers for hashed static assets.

### `routing.fallback`

Final rewrite routes checked when earlier phases did not produce a match.

### Common Route Fields

Each route entry can include:

- `source`: Original route pattern (optional for generated internal rules)
- `sourceRegex`: Compiled regex for matching requests
- `destination`: Internal destination or redirect destination
- `headers`: Headers to apply
- `has`: Positive matching conditions
- `missing`: Negative matching conditions
- `status`: Redirect status code
- `priority`: Internal route priority flag

## Use Cases

Common use cases for adapters include:

- **Deployment Platform Integration**: Automatically configure build outputs for specific hosting platforms
- **Asset Processing**: Transform or optimize build outputs
- **Monitoring Integration**: Collect build metrics and route information
- **Custom Bundling**: Package outputs in platform-specific formats
- **Build Validation**: Ensure outputs meet specific requirements
- **Route Generation**: Use processed route information to generate platform-specific routing configs
