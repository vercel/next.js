---
description: Export your Next.js app to static HTML, and run it standalone without the need of a Node.js server.
---

# Static HTML Export

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-static-export">Static Export</a></li>
  </ul>
</details>

Next.js can be used to generate static applications, including using React in the browser without the need for a Node.js server.

The core of Next.js has been designed to enable starting as a static site (or Single-Page Application), if desired, and later upgrade to use powerful, dynamic features that require a server. For example, [Incremental Static Regeneration](/docs/basic-features/data-fetching/incremental-static-regeneration.md), [Internationalized Routing](/docs/advanced-features/i18n-routing.md), [and more](#unsupported-features).

Since Next.js supports this static export, it can be deployed and hosted on any web server that can serve HTML/CSS/JS static assets.

## Usage

Update your [`next.config.js`](/docs/api-reference/next.config.js/introduction.md) file to include `output: 'export'` like the following:

```js
/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
}

module.exports = nextConfig
```

Then run `next build` to generate an `out` directory containing the HTML/CSS/JS static assets.

You can utilize [`getStaticProps`](/docs/basic-features/data-fetching/get-static-props.md) and [`getStaticPaths`](/docs/basic-features/data-fetching/get-static-paths.md) to generate an HTML file for each page in your `pages` directory (or more for [dynamic routes](/docs/routing/dynamic-routes.md)).

If you want to change the output directory, you can configure `distDir` like the following:

```js
/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  distDir: 'dist',
}

module.exports = nextConfig
```

In this example, `next build` will generate a `dist` directory containing the HTML/CSS/JS static assets.

Learn more about [Setting a custom build directory](/docs/api-reference/next.config.js/setting-a-custom-build-directory.md).

If you want to change the output directory structure to always include a trailing slash, you can configure `trailingSlash` like the following:

```js
/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
}

module.exports = nextConfig
```

This will change links so that `href="/about"` will instead be `href="/about/"`. It will also change the output so that `out/about.html` will instead emit `out/about/index.html`.

Learn more about [Trailing Slash](/docs/api-reference/next.config.js/trailing-slash.md).

## Supported Features

The majority of core Next.js features needed to build a static site are supported, including:

- [Dynamic Routes when using `getStaticPaths`](/docs/routing/dynamic-routes.md)
- Prefetching with `next/link`
- Preloading JavaScript
- [Dynamic Imports](/docs/advanced-features/dynamic-import.md)
- Any styling options (e.g. CSS Modules, styled-jsx)
- [Client-side data fetching](/docs/basic-features/data-fetching/client-side.md)
- [`getStaticProps`](/docs/basic-features/data-fetching/get-static-props.md)
- [`getStaticPaths`](/docs/basic-features/data-fetching/get-static-paths.md)
- [Image Optimization](/docs/basic-features/image-optimization.md) using a [custom loader](/docs/basic-features/image-optimization.md#loaders)

## Unsupported Features

Features that require a Node.js server, or dynamic logic that cannot be computed during the build process, are not supported:

- [Image Optimization](/docs/basic-features/image-optimization.md) (default loader)
- [Internationalized Routing](/docs/advanced-features/i18n-routing.md)
- [API Routes](/docs/api-routes/introduction.md)
- [Rewrites](/docs/api-reference/next.config.js/rewrites.md)
- [Redirects](/docs/api-reference/next.config.js/redirects.md)
- [Headers](/docs/api-reference/next.config.js/headers.md)
- [Middleware](/docs/middleware.md)
- [Incremental Static Regeneration](/docs/basic-features/data-fetching/incremental-static-regeneration.md)
- [`getStaticPaths` with `fallback: true`](/docs/api-reference/data-fetching/get-static-paths.md#fallback-true)
- [`getStaticPaths` with `fallback: 'blocking'`](/docs/api-reference/data-fetching/get-static-paths.md#fallback-blocking)
- [`getServerSideProps`](/docs/basic-features/data-fetching/get-server-side-props.md)

### `getInitialProps`

It's possible to use the [`getInitialProps`](/docs/api-reference/data-fetching/get-initial-props.md) API instead of `getStaticProps`, but it comes with a few caveats:

- `getInitialProps` cannot be used alongside `getStaticProps` or `getStaticPaths` on any given page. If you have dynamic routes, instead of using `getStaticPaths` you'll need to configure the [`exportPathMap`](/docs/api-reference/next.config.js/exportPathMap.md) parameter in your [`next.config.js`](/docs/api-reference/next.config.js/introduction.md) file to let the exporter know which HTML files it should output.
- When `getInitialProps` is called during export, the `req` and `res` fields of its [`context`](/docs/api-reference/data-fetching/get-initial-props.md#context-object) parameter will be empty objects, since during export there is no server running.
- `getInitialProps` **will be called on every client-side navigation**, if you'd like to only fetch data at build-time, switch to `getStaticProps`.
- `getInitialProps` should fetch from an API and cannot use Node.js-specific libraries or the file system like `getStaticProps` can.

We recommend migrating towards `getStaticProps` over `getInitialProps` whenever possible.

## next export

> **Warning**: "next export" is deprecated since Next.js 13.3 in favor of "output: 'export'" configuration.

In versions of Next.js prior to 13.3, there was no configuration option in next.config.js and instead there was a separate command for `next export`.

This could be used by updating your `package.json` file to include `next export` like the following:

```json
"scripts": {
  "build": "next build && next export"
}
```

Running `npm run build` will generate an `out` directory.

`next export` builds an HTML version of your app. During `next build`, [`getStaticProps`](/docs/basic-features/data-fetching/get-static-props.md) and [`getStaticPaths`](/docs/basic-features/data-fetching/get-static-paths.md) will generate an HTML file for each page in your `pages` directory (or more for [dynamic routes](/docs/routing/dynamic-routes.md)). Then, `next export` will copy the already exported files into the correct directory. `getInitialProps` will generate the HTML files during `next export` instead of `next build`.

> **Warning**: Using [`exportPathMap`](/docs/api-reference/next.config.js/exportPathMap.md) is deprecated and is overridden by `getStaticPaths` inside `pages`. We recommend not to use them together.
