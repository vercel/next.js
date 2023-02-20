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

`next export` allows you to export your Next.js application to static HTML, which can render without the need of a Node.js server. It is recommended to only use `next export` if you don't need any of the [unsupported features](#unsupported-features) requiring a server.

If you're looking to build a hybrid site where only _some_ pages are prerendered to static HTML, Next.js already does that automatically. Learn more about [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md) and [Incremental Static Regeneration](/docs/basic-features/data-fetching/incremental-static-regeneration.md).

## `next export`

Update your build script in `package.json` to use `next export`:

```json
"scripts": {
  "build": "next build && next export"
}
```

Running `npm run build` will generate an `out` directory.

`next export` builds an HTML version of your app. During `next build`, [`getStaticProps`](/docs/basic-features/data-fetching/get-static-props.md) and [`getStaticPaths`](/docs/basic-features/data-fetching/get-static-paths.md) will generate an HTML file for each page in your `pages` directory (or more for [dynamic routes](/docs/routing/dynamic-routes.md)). Then, `next export` will copy the already exported files into the correct directory. `getInitialProps` will generate the HTML files during `next export` instead of `next build`.

For more advanced scenarios, you can define a parameter called [`exportPathMap`](/docs/api-reference/next.config.js/exportPathMap.md) in your [`next.config.js`](/docs/api-reference/next.config.js/introduction.md) file to configure exactly which pages will be generated.

> **Warning**: Using `exportPathMap` for defining routes with any `getStaticPaths` powered page is now ignored and gets overridden. We recommend not to use them together.

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
- [`fallback: true`](/docs/api-reference/data-fetching/get-static-paths.md#fallback-true)
- [`getServerSideProps`](/docs/basic-features/data-fetching/get-server-side-props.md)

### `getInitialProps`

It's possible to use the [`getInitialProps`](/docs/api-reference/data-fetching/get-initial-props.md) API instead of `getStaticProps`, but it comes with a few caveats:

- `getInitialProps` cannot be used alongside `getStaticProps` or `getStaticPaths` on any given page. If you have dynamic routes, instead of using `getStaticPaths` you'll need to configure the [`exportPathMap`](/docs/api-reference/next.config.js/exportPathMap.md) parameter in your [`next.config.js`](/docs/api-reference/next.config.js/introduction.md) file to let the exporter know which HTML files it should output.
- When `getInitialProps` is called during export, the `req` and `res` fields of its [`context`](/docs/api-reference/data-fetching/get-initial-props.md#context-object) parameter will be empty objects, since during export there is no server running.
- `getInitialProps` **will be called on every client-side navigation**, if you'd like to only fetch data at build-time, switch to `getStaticProps`.
- `getInitialProps` should fetch from an API and cannot use Node.js-specific libraries or the file system like `getStaticProps` can.

We recommend migrating towards `getStaticProps` over `getInitialProps` whenever possible.
