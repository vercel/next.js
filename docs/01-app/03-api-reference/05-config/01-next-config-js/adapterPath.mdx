---
title: experimental.adapterPath
description: Configure a custom adapter for Next.js to hook into the build process with modifyConfig and onBuildComplete callbacks.
---

Next.js provides an experimental API that allows you to create custom adapters to hook into the build process. This is useful for deployment platforms or custom build integrations that need to modify the Next.js configuration or process the build output.

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
export interface NextAdapter {
  name: string
  modifyConfig?: (
    config: NextConfigComplete,
    ctx: {
      phase: PHASE_TYPE
    }
  ) => Promise<NextConfigComplete> | NextConfigComplete
  onBuildComplete?: (ctx: {
    routes: {
      headers: Array<ManifestHeaderRoute>
      redirects: Array<ManifestRedirectRoute>
      rewrites: {
        beforeFiles: Array<ManifestRewriteRoute>
        afterFiles: Array<ManifestRewriteRoute>
        fallback: Array<ManifestRewriteRoute>
      }
      dynamicRoutes: ReadonlyArray<ManifestRoute>
    }
    outputs: AdapterOutputs
    projectDir: string
    repoRoot: string
    distDir: string
    config: NextConfigComplete
    nextVersion: string
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
    routes,
    outputs,
    projectDir,
    repoRoot,
    distDir,
    config,
    nextVersion,
  }) {
    // Process the build output
    console.log('Build completed with', outputs.pages.length, 'pages')

    // Access different output types
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

- `routes`: Object containing route manifests for headers, redirects, rewrites, and dynamic routes
  - `routes.headers`: Array of header route objects with `source`, `sourceRegex`, `headers`, `has`, `missing`, and optional `priority` fields
  - `routes.redirects`: Array of redirect route objects with `source`, `sourceRegex`, `destination`, `statusCode`, `has`, `missing`, and optional `priority` fields
  - `routes.rewrites`: Object with `beforeFiles`, `afterFiles`, and `fallback` arrays, each containing rewrite route objects with `source`, `sourceRegex`, `destination`, `has`, and `missing` fields
  - `routes.dynamicRoutes`: Array of dynamic route objects with `source`, `sourceRegex`, `destination`, `has`, and `missing` fields
- `outputs`: Detailed information about all build outputs organized by type
- `projectDir`: Absolute path to the Next.js project directory
- `repoRoot`: Absolute path to the detected repository root
- `distDir`: Absolute path to the build output directory
- `config`: The final Next.js configuration (with `modifyConfig` applied)
- `nextVersion`: Version of Next.js being used
- `buildId`: Unique identifier for the current build

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
  parentFallbackMode?: 'blocking' | false | null  // Fallback mode from getStaticPaths
  fallback?: {
    filePath: string
    initialStatus?: number
    initialHeaders?: Record<string, string | string[]>
    initialExpiration?: number
    initialRevalidate?: number
    postponedState?: string  // PPR postponed state
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

## Routes Information

The `routes` object in `onBuildComplete` provides complete routing information with processed patterns ready for deployment:

### Headers

Each header route includes:

- `source`: Original route pattern (e.g., `/about`)
- `sourceRegex`: Compiled regex for matching requests
- `headers`: Key-value pairs of headers to apply
- `has`: Optional conditions that must be met
- `missing`: Optional conditions that must not be met
- `priority`: Optional flag for internal routes

### Redirects

Each redirect route includes:

- `source`: Original route pattern
- `sourceRegex`: Compiled regex for matching
- `destination`: Target URL (can include captured groups)
- `statusCode`: HTTP status code (301, 302, 307, 308)
- `has`: Optional positive conditions
- `missing`: Optional negative conditions
- `priority`: Optional flag for internal routes

### Rewrites

Rewrites are categorized into three phases:

- `beforeFiles`: Checked before filesystem (including pages and public files)
- `afterFiles`: Checked after pages/public files but before dynamic routes
- `fallback`: Checked after all other routes

Each rewrite includes `source`, `sourceRegex`, `destination`, `has`, and `missing`.

### Dynamic Routes

Generated from dynamic route segments (e.g., `[slug]`, `[...path]`). Each includes:

- `source`: Route pattern
- `sourceRegex`: Compiled regex with named capture groups
- `destination`: Internal destination with parameter substitution
- `has`: Optional positive conditions
- `missing`: Optional negative conditions

## Use Cases

Common use cases for adapters include:

- **Deployment Platform Integration**: Automatically configure build outputs for specific hosting platforms
- **Asset Processing**: Transform or optimize build outputs
- **Monitoring Integration**: Collect build metrics and route information
- **Custom Bundling**: Package outputs in platform-specific formats
- **Build Validation**: Ensure outputs meet specific requirements
- **Route Generation**: Use processed route information to generate platform-specific routing configs
