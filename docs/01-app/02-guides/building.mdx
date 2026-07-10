---
title: Building your application
description: Learn what happens when you run next build and how to read the build output.
nav_title: Building
related:
  description: Related API references and guides.
  links:
    - app/api-reference/cli/next
    - app/getting-started/caching
    - app/api-reference/functions/generate-static-params
    - app/api-reference/config/next-config-js/cacheComponents
    - app/guides/streaming
    - app/guides/incremental-static-regeneration-cache-components
    - app/guides/ci-build-caching
---

Running `next build` compiles your application for production. It bundles and optimizes your code, [prerenders](/docs/app/glossary#prerendering) every route it can, and prints a route table that shows how each URL is served.

This guide will show you how to read the build output, including the route table and prerender-blocking errors.

> The output and errors on this page show [Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents) enabled, set with `cacheComponents: true` in your `next.config.ts` file. Much of the guide applies without it, but the route table symbols and the prerender-blocking errors differ. See [Enabling Cache Components](/docs/app/getting-started/caching#enabling-cache-components) for setup.

## What `next build` does

When you run `next build`, the build moves through these phases:

1. **Setup.** Loads [environment variables](/docs/app/guides/environment-variables) (`.env` files), validates your [`next.config`](/docs/app/api-reference/config/next-config-js), and generates a [build ID](/docs/app/api-reference/config/next-config-js/generateBuildId).
2. **Route discovery.** Scans the `app/` and `pages/` directories for routes, and detects root-level convention files like [`proxy`](/docs/app/api-reference/file-conventions/proxy) and [`instrumentation`](/docs/app/api-reference/file-conventions/instrumentation). Generates TypeScript route definitions.
3. **Compilation.** Bundles client, server, and edge code with [Turbopack](/docs/app/api-reference/turbopack) (or webpack). Transpiles TypeScript and JSX, tree-shakes unused code, and optimizes CSS and fonts. Type checking runs in parallel.
4. **Static analysis.** Classifies each route for prerendering versus on-demand rendering. Collects [`generateStaticParams`](/docs/app/api-reference/functions/generate-static-params) output. Checks for [prerender-blocking errors](/docs/messages/blocking-prerender-dynamic).
5. **Prerendering.** Prerenders static pages and PPR shells to HTML. Generates [RSC payloads](/docs/app/getting-started/server-and-client-components#on-the-server) for client-side navigation.
6. **Output.** Writes the build to `.next/`. For [`output: 'standalone'`](/docs/app/guides/self-hosting), bundles only the files needed at runtime. For [`output: 'export'`](/docs/app/guides/static-exports), generates a full static site. Prints the route table.

## Reading the build output

The build command depends on your package manager:

```bash package="pnpm"
pnpm build
```

```bash package="npm"
npm run build
```

```bash package="yarn"
yarn build
```

```bash package="bun"
bun run build
```

After a successful build, Next.js prints a route table with a symbol next to each route, showing how it is served:

| Symbol | Name              | Behavior                                                                     |
| ------ | ----------------- | ---------------------------------------------------------------------------- |
| `○`    | Static            | Fully prerendered at build time. Served without server rendering.            |
| `◐`    | Partial Prerender | Static shell served immediately. Dynamic content streams in at request time. |
| `●`    | SSG               | Prerendered static HTML (from `generateStaticParams` or `getStaticProps`).   |
| `ƒ`    | Dynamic           | Server-rendered on demand for each request.                                  |

`○` Static, `●` SSG, and `ƒ` Dynamic are the modes Next.js applications have always rendered in, including on the Pages Router: each route is either prerendered to static HTML or server-rendered on demand for each request.

[Cache Components](/docs/app/api-reference/config/next-config-js/cacheComponents) adds `◐` Partial Prerender and makes [Partial Prerendering](/docs/app/getting-started/caching#static-cached-and-streaming) the default rendering model. Each route is split into a static shell, prerendered at build time, and dynamic parts that stream in at request time. Routes sit on a spectrum from fully static (`○`) to partially prerendered (`◐`) and are no longer fully server-rendered: a route shows `ƒ` only when it has nothing to prerender, such as [Route Handlers](/docs/app/api-reference/file-conventions/route) that depend on the request, Proxy (Middleware), and dynamic [metadata](/docs/app/api-reference/functions/generate-metadata) like `icon` or `opengraph-image`.

The symbol reflects what the route does at prerender time, not which validation configs (such as [`instant`](/docs/app/api-reference/file-conventions/route-segment-config/instant)) it exports. Without Cache Components, or on the Pages Router, prerendered pages can also show `●` (SSG).

## Example

Prerender validation is one of the most common reasons production builds fail. This is a safeguard: Cache Components catches uncached and runtime data at build time, before it can slow down your app in production. The rest of this guide walks through one such error, from the failed build to the fix.

This example uses a store app with a dynamic product page that loads data by id:

```txt
app/
├── layout.tsx
├── page.tsx
└── products/
    └── [id]/
        └── page.tsx
```

We'll work in `app/products/[id]/page.tsx`:

```tsx filename="app/products/[id]/page.tsx" switcher
export default async function Page(props: PageProps<'/products/[id]'>) {
  const { id } = await props.params
  const res = await fetch(`https://api.example.com/products/${id}`)
  const product = await res.json()
  return <div>{product.name}</div>
}
```

```jsx filename="app/products/[id]/page.js" switcher
export default async function Page({ params }) {
  const { id } = await params
  const res = await fetch(`https://api.example.com/products/${id}`)
  const product = await res.json()
  return <div>{product.name}</div>
}
```

During the build, Next.js prerenders as much of each route as it can at [build time](/docs/app/glossary#build-time). [Runtime data](/docs/app/glossary#request-time-apis) ([`params`](/docs/app/api-reference/file-conventions/page#params-optional), [`searchParams`](/docs/app/api-reference/file-conventions/page#searchparams-optional), [`cookies()`](/docs/app/api-reference/functions/cookies), [`headers()`](/docs/app/api-reference/functions/headers)) and uncached data (`fetch()`, database calls) are not available during that pass. Wrap runtime reads in [`<Suspense>`](https://react.dev/reference/react/Suspense), and cache data accesses with [`use cache`](/docs/app/api-reference/directives/use-cache) or wrap them in `<Suspense>` too. Otherwise, the build fails with a [`blocking-prerender-runtime`](/docs/messages/blocking-prerender-runtime) or [`blocking-prerender-dynamic`](/docs/messages/blocking-prerender-dynamic) error. [Random values and timestamps](/docs/app/getting-started/caching#random-values-and-timestamps) such as `Math.random()` or `new Date()` can also fail the build.

Run `next build`. It fails with a prerender-blocking error because the `params` read and the uncached `fetch` run outside a `<Suspense>` boundary:

```bash filename="Terminal"
Error: Route "/products/[id]": Next.js encountered uncached or runtime data during prerendering.

`fetch(...)`, `cookies()`, `headers()`, `params`, `searchParams`, or `connection()` accessed outside of `<Suspense>` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

Ways to fix this:
  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#wrap-in-or-move-into-suspense
  - [cache] For uncached data (`fetch`, database calls): cache the access with `"use cache"` (does not apply to `connection()`)
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#cache-the-component-or-data
  - [block] Set `export const instant = false` to allow a blocking route
    https://nextjs.org/docs/messages/blocking-prerender-dynamic#allow-blocking-route
    at body (<anonymous>)
    at html (<anonymous>)
To get a more detailed stack trace and pinpoint the issue, try one of the following:
  - Start the app in development mode by running `next dev`, then open "/products/[id]" in your browser to investigate the error.
  - Rerun the production build with `next build --debug-prerender` to generate better stack traces.
Error occurred prerendering page "/products/[id]".
```

### Debugging build errors

Sometimes the error cannot provide enough information, because production builds minify server code and don't generate source maps for it. Rerun the build with [`--debug-prerender`](/docs/app/api-reference/cli/next#debugging-prerender-errors):

```bash filename="Terminal"
next build --debug-prerender
```

That disables minification, turns on source maps for server bundles, and continues past the first failure, so remaining issues surface in one run. This helps with any error thrown during prerendering, not only blocking ones. The stack now points at the first blocked access in the page, the `params` read:

```bash filename="Terminal"
Error: Route "/products/[id]": Next.js encountered uncached or runtime data during prerendering.
  ...
    at Page (app/products/[id]/page.tsx:2:30)
  1 | export default async function Page(props: PageProps<'/products/[id]'>) {
> 2 |   const { id } = await props.params
    |                              ^
  3 |   const res = await fetch(`https://api.example.com/products/${id}`)
  4 |   const product = await res.json()
```

> **Warning**: Do not deploy builds produced with `--debug-prerender`. They skip optimizations you need in production.

Running the route in `next dev` shows the full error immediately, with the component and line already resolved. See [Ensuring instant navigations](/docs/app/guides/instant-navigation) for working with these errors in depth.

With the cause located, let's apply each fix and see how the build output changes.

### A streaming route

The error's first suggestion, `[stream]`, is to provide a placeholder around the data access. Add a [`loading.js`](/docs/app/api-reference/file-conventions/loading) file to wrap the whole segment in a `<Suspense>` boundary. Next.js prerenders the fallback as the route's static shell, while the params and data work runs at request time. For other boundary placements, see [Streaming](/docs/app/guides/streaming):

```tsx filename="app/products/[id]/loading.tsx" switcher
export default function Loading() {
  return <div>Loading...</div>
}
```

```jsx filename="app/products/[id]/loading.js" switcher
export default function Loading() {
  return <div>Loading...</div>
}
```

Run the build. It passes, and the route is [partially prerendered](/docs/app/glossary#partial-prerendering-ppr):

```bash filename="Terminal"
Route (app)
┌ ○ /                   # Prerendered at build time
├ ○ /_not-found
└   /products/[id]
  └ ◐ /products/[id]    # Shell prerendered, content streams on request

○  (Static)             prerendered as static content
◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
```

Product URLs now serve the prerendered shell instantly, then stream the page content.

### Building specific routes

If we were iterating on this route alone in a larger app, we could also scope each build to it instead of rebuilding everything. Pass [`--debug-build-paths`](/docs/app/api-reference/cli/next#building-specific-routes) with the route files to include:

```bash filename="Terminal"
next build --debug-build-paths="app/products/[id]/page.tsx"
```

Next.js compiles and prerenders only the matching routes, and skips the rest of the app. The option accepts comma-separated paths and glob patterns, with a `!` prefix to exclude, and combines with `--debug-prerender` while debugging. Our store only has a few routes, so we'll keep building the whole app.

### Prerendered params

The [dynamic segment](/docs/app/glossary#dynamic-route-segments) shows a single fallback row because Next.js doesn't know which param values exist. Export `generateStaticParams` to list them:

```tsx filename="app/products/[id]/page.tsx" switcher
export async function generateStaticParams() {
  const res = await fetch('https://api.example.com/products')
  const products = await res.json()
  return products.map((product) => ({ id: product.id }))
}

export default async function Page(props: PageProps<'/products/[id]'>) {
  const { id } = await props.params
  const res = await fetch(`https://api.example.com/products/${id}`)
  const product = await res.json()
  return <div>{product.name}</div>
}
```

```jsx filename="app/products/[id]/page.js" switcher
export async function generateStaticParams() {
  const res = await fetch('https://api.example.com/products')
  const products = await res.json()
  return products.map((product) => ({ id: product.id }))
}

export default async function Page({ params }) {
  const { id } = await params
  const res = await fetch(`https://api.example.com/products/${id}`)
  const product = await res.json()
  return <div>{product.name}</div>
}
```

Running the build again adds a row for each listed param, indented under the `/products/[id]` route:

```bash filename="Terminal"
Route (app)
┌ ○ /
├ ○ /_not-found
└   /products/[id]
  ├ ◐ /products/[id]
  ├ ◐ /products/1       # Params known, data still uncached
  ├ ◐ /products/2       # Params known, data still uncached
  └ ◐ /products/3       # Params known, data still uncached

○  (Static)             prerendered as static content
◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
```

> **Good to know**: `generateStaticParams` must return at least one param. An empty array causes a [build error](/docs/messages/empty-generate-static-params).

The new rows show `◐`, not `○`. Listing the params tells Next.js which pages exist, but their content still comes from the uncached lookup, which only runs at request time. Each page serves the static shell and streams its content.

> **Good to know**: Here the `fetch` runs during prerendering, so point it at a working endpoint or a fake async source that returns data. The `◐` rows appear only when the lookup is real uncached I/O; a synchronous in-memory value is treated as static and prerenders each param to `○` instead.

### Cached data

The error's `[cache]` fix moves the lookup to build time. Add `use cache` so it can run during prerendering:

```tsx filename="app/products/[id]/page.tsx" switcher
export async function generateStaticParams() {
  const res = await fetch('https://api.example.com/products')
  const products = await res.json()
  return products.map((product) => ({ id: product.id }))
}

async function getProduct(id: string) {
  'use cache'
  const res = await fetch(`https://api.example.com/products/${id}`)
  return res.json()
}

export default async function Page(props: PageProps<'/products/[id]'>) {
  const { id } = await props.params
  const product = await getProduct(id)
  return <div>{product.name}</div>
}
```

```jsx filename="app/products/[id]/page.js" switcher
export async function generateStaticParams() {
  const res = await fetch('https://api.example.com/products')
  const products = await res.json()
  return products.map((product) => ({ id: product.id }))
}

async function getProduct(id) {
  'use cache'
  const res = await fetch(`https://api.example.com/products/${id}`)
  return res.json()
}

export default async function Page({ params }) {
  const { id } = await params
  const product = await getProduct(id)
  return <div>{product.name}</div>
}
```

Running the build again shows the listed params as `○`. Their params are known and their data is cached, so Next.js prerenders each page in full. The `◐` row remains for unlisted params, which serve the static shell while their content streams:

```bash filename="Terminal"
Route (app)
┌ ○ /
├ ○ /_not-found
└   /products/[id]
  ├ ◐ /products/[id]    # Unlisted params stream on demand
  ├ ○ /products/1       # Prerendered in full at build time
  ├ ○ /products/2       # Prerendered in full at build time
  └ ○ /products/3       # Prerendered in full at build time

○  (Static)             prerendered as static content
◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
```

Pages that read `cookies()`, `headers()`, or `searchParams` stay `◐`, streaming those parts into the shell on each visit.

When a user visits an unlisted param, Next.js serves the static shell immediately while the content streams in, then upgrades the page in the background. See [Incremental Static Regeneration with Cache Components](/docs/app/guides/incremental-static-regeneration-cache-components).

When there are more prerendered paths than fit in the table, Next.js prints a short list ending with `[+N more paths]`.

Routes that contain cached functions or components also show `Revalidate` and `Expire` columns. A route reports the shortest `revalidate` and `expire` across all the caches it contains. This applies even without an explicit [`cacheLife`](/docs/app/api-reference/functions/cacheLife) call, since caches use the [`default` profile](/docs/app/api-reference/functions/cacheLife#preset-cache-profiles). Let's add a `/products` listing page that renders the same cached product data:

```bash filename="Terminal"
Route (app)           Revalidate  Expire
┌ ○ /
├ ○ /_not-found
├ ○ /products                15m      1y
└   /products/[id]
  ├ ◐ /products/[id]
  ├ ○ /products/1            15m      1y
  ├ ○ /products/2            15m      1y
  └ ○ /products/3            15m      1y
```

The routes [revalidate](/docs/app/getting-started/revalidating) after 15 minutes, the value of the `default` profile. The profile never expires, and the `Expire` column caps at one year, shown as `1y`. The table doesn't show which cache produced the values, so with multiple caches in a route, check their `cacheLife` calls.

### A blocking route

The error's last suggestion, `[block]`, is the alternative to the fixes above. Say we had removed them, and only set `instant = false` on the original page. This doesn't change how the route renders. It only opts out of validation to purposely allow a blocking route:

```tsx filename="app/products/[id]/page.tsx" switcher
export const instant = false

export default async function Page(props: PageProps<'/products/[id]'>) {
  const { id } = await props.params
  const res = await fetch(`https://api.example.com/products/${id}`)
  const product = await res.json()
  return <div>{product.name}</div>
}
```

```jsx filename="app/products/[id]/page.js" switcher
export const instant = false

export default async function Page({ params }) {
  const { id } = await params
  const res = await fetch(`https://api.example.com/products/${id}`)
  const product = await res.json()
  return <div>{product.name}</div>
}
```

The build passes, and the output looks the same as the streaming route. Dynamic segments show a `◐` fallback row even when nothing meaningful is prerendered:

```bash filename="Terminal"
Route (app)
┌ ○ /
├ ○ /_not-found
└   /products/[id]
  └ ◐ /products/[id]    # Renders on demand, blocking on the lookup

○  (Static)             prerendered as static content
◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
```

Unlike the streaming route, there is no fallback UI: users see nothing until the lookup completes. See [Opting out](/docs/app/guides/instant-navigation#opting-out) for when this is appropriate.

## Next steps

We've learned how to run a production build, read the route table, and understand prerender-blocking errors. Next, learn how to:

- [Deploy your application](/docs/app/getting-started/deploying)
- [Cache data and UI](/docs/app/getting-started/caching)
- [Revalidate cached routes with ISR](/docs/app/guides/incremental-static-regeneration-cache-components)
- [Configure CI build caching](/docs/app/guides/ci-build-caching)
