---
title: cssChunking
description: Use the `cssChunking` option to control how CSS files are chunked in your Next.js application.
version: experimental
---

CSS Chunking is a strategy used to improve the performance of your web application by splitting and re-ordering CSS files into chunks. This lets a route load close to only the CSS it needs, instead of loading all the application's CSS at once.

You can control how CSS files are chunked using the `experimental.cssChunking` option in your `next.config.js` file:

```tsx filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig = {
  experimental: {
    cssChunking: true, // default
  },
} satisfies NextConfig

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    cssChunking: true, // default
  },
}

module.exports = nextConfig
```

## Options

- **`true` (default)** (**webpack and Turbopack**): Next.js will try to merge CSS files whenever possible, determining explicit and implicit dependencies between files from import order to reduce the number of chunks and therefore the number of requests.
- **`false`** (**webpack only**): Next.js will not attempt to merge or re-order your CSS files.
- **`'strict'`** (**webpack only**): Next.js will load CSS files in the correct order they are imported into your files, which can lead to more chunks and requests.
- **`'graph'`** (**Turbopack only**): Next.js uses a cost-based graph algorithm to group CSS across your routes, balancing the bytes each route downloads and the requests it makes.

## Choosing a strategy

For most applications, the default (`true`) is the right choice in either bundler: it merges CSS to make fewer requests. Reach for another strategy only for a specific reason.

In Turbopack, that reason is usually performance. Switch to `graph` to tune how CSS is shared across routes, cutting the unused CSS a route downloads at the cost of more requests (see [Balancing requests and grouping](#balancing-requests-and-grouping)).

In webpack, that reason is usually correctness. Switch to `'strict'` if you run into unexpected CSS behavior. For example, if you import `a.css` and `b.css` in different files using a different `import` order (`a` before `b`, or `b` before `a`), `true` merges them in any order and assumes there are no dependencies between them; if `b.css` depends on `a.css`, `'strict'` prevents the merge and loads them in import order, at the cost of more chunks and requests. Use `false` to disable merging entirely.

## Debugging what a route actually uses

While some unused CSS is acceptable, and most apps do not need to change anything, it is worth keeping render-blocking CSS in check. [Lighthouse](https://developer.chrome.com/docs/lighthouse/performance/unused-css-rules) flags this as a **Reduce unused CSS** opportunity with an estimated saving, and Chrome DevTools shows it per stylesheet in its [Coverage panel](https://developer.chrome.com/docs/devtools/coverage), where a usage bar shows each stylesheet's applied CSS in green and unused CSS in gray.

When reading the report, watch out for styles that only apply on interaction, such as `:hover`, `:focus`, or classes toggled by JavaScript for menus and modals, since Coverage counts them as unused until you trigger them.

The source of this unused CSS is one of two things. Either it is dead CSS in a stylesheet your route imports, which you fix in your source by removing the unused rules or moving them into a stylesheet only the routes that use them import ([CSS Modules](/docs/app/getting-started/css#css-modules) make this natural by scoping styles to the component that imports them).

Or the bundler merged another stylesheet into a shared chunk that your route loads. That is governed by your [chunking strategy](#choosing-a-strategy). In Turbopack, [`graph` mode](#balancing-requests-and-grouping) lets you fine-tune how aggressively CSS merges.

## Balancing requests and grouping

The `graph` strategy groups CSS into shared chunks to cut requests. Turn it on with the string form, which uses the default tuning:

```tsx filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig = {
  experimental: {
    cssChunking: 'graph',
  },
} satisfies NextConfig

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    cssChunking: 'graph',
  },
}

module.exports = nextConfig
```

To shift that balance, pass an object instead. Both `requestCost` and `weightDistribution` are optional, so include only the one you want to change:

```tsx filename="next.config.ts" switcher
import type { NextConfig } from 'next'

const nextConfig = {
  experimental: {
    cssChunking: {
      type: 'graph',
      requestCost: 100000,
      weightDistribution: 0.1,
    },
  },
} satisfies NextConfig

export default nextConfig
```

```js filename="next.config.js" switcher
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    cssChunking: {
      type: 'graph',
      requestCost: 100000,
      weightDistribution: 0.1,
    },
  },
}

module.exports = nextConfig
```

- **`requestCost`** (default `20000`): the estimated cost, in bytes, of each additional CSS request. Larger values bias toward fewer, larger shared chunks, and fewer requests overall.
- **`weightDistribution`** (default `0.1`): controls how a shared chunk's cost is distributed across the routes that load it, weighted by how much CSS each route imports. `0` weights every route equally; higher values give more weight to routes that import less CSS, so the algorithm prioritizes routes with less CSS, assuming extra CSS is less noticeable on large routes.

### How `graph` decides what to merge

Merging CSS into shared chunks is what the default (`true`) already does; `graph` just lets you control where it draws the line between merging and splitting.

Take two routes that share a stylesheet:

```txt
/a → [shared.css, only-a.css]
/b → [shared.css]
```

Here, `/b` never imports `only-a.css`, so there is one decision to make: keep `only-a.css` in the shared chunk, or give it its own.

Keeping it merged lets `/a` load all its CSS in a single request. The cost is that `/b`, which also loads that shared chunk, now downloads `only-a.css` even though it never imported it.

Splitting it out spares `/b` those bytes, but now `/a` has to make two requests. The default picks between these with a fixed heuristic.

The `requestCost` option is how `graph` prices that trade: the amount of un-imported CSS worth one extra request. It keeps `only-a.css` merged while `only-a.css` stays well under `requestCost`, and splits it out once it grows large enough to outweigh the request.

What drives the decision is the size of the un-imported CSS a merge would push onto a route, much more than the size of the shared chunk it joins. With the default `requestCost` of about 20 KB, `only-a.css` would have to exceed roughly that size before it earns its own chunk, so small stylesheets stay merged.

<details>
  <summary>Graph algorithm overview</summary>

At a high level, the algorithm works with individual CSS files. It starts from the ordered list of CSS each route imports:

```txt
/dashboard  → [reset.css, theme.css, layout.css, dashboard.css]
/settings   → [reset.css, theme.css, layout.css, settings.css]
/login      → [reset.css, login.css]
```

From these it builds a weighted graph where two CSS files get a heavier edge the more routes import them together in the same order. It flattens that graph into a single line that keeps frequently-paired files adjacent, then places _cuts_ that divide the line into chunks, for example:

```txt
reset theme layout │ dashboard │ settings │ login
└──── chunk 1 ────┘   chunk 2     chunk 3    chunk 4
```

A route loads every chunk holding a file it imports, so `/dashboard` loads chunks 1 and 2 while `/login` loads chunks 1 and 4.

The algorithm chooses where to split chunks to minimize the total download cost across all routes, balancing bytes and requests. It optimizes that total, not each route on its own, so a route can end up carrying some CSS it never imported when that keeps the overall cost down. The two options control the weighing:

- **`requestCost`**: `reset.css`, `theme.css`, and `layout.css` share one chunk, so a route that needs them makes one request instead of three. `requestCost` is the price of a request in bytes: raise it and the algorithm merges more like this, trading larger downloads for fewer requests; lower it toward `0` and it splits chunks apart, so routes download closer to only what they import but make more requests.
- **`weightDistribution`**: `/login` needs only `reset.css` from chunk 1 but downloads `theme.css` and `layout.css` too, since they share that chunk. This option decides how much the algorithm minds that. At `0`, `/login` and `/dashboard` count equally, so it lets the extra ride along; raise it and routes that import little CSS, like `/login`, count for more, so the algorithm works to spare them CSS they never imported, at the cost of more requests overall.

</details>
