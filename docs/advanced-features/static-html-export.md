---
description: Export your Next.js app to static HTML, and run it standalone without the need of a Node.js server.
---

# Static HTML Export

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-static-export">Static Export</a></li>
  </ul>
</details>

`next export` allows you to export your app to static HTML, which can be run standalone without the need of a Node.js server.

The exported app supports almost every feature of Next.js, including dynamic routes, prefetching, preloading and dynamic imports.

`next export` works by prerendering all pages to HTML. For [dynamic routes](https://nextjs.org/docs/routing/dynamic-routes), you can export a [`getStaticPaths`](https://nextjs.org/docs/basic-features/data-fetching#getstaticpaths-static-generation) to let the exporter know which HTML pages to generate for that route.

> Note that the `fallback: true` mode of `getStaticPaths` is not supported when using `next export`. Fallback mode only works in serverless configurations or when using `next start` or a custom server; for `next export`, the `fallback` parameter will be treated as if it were `false` and any routes not defined by `getStaticPaths` will return a 404.

`next export` is intended for scenarios where _none_ of your pages have SSR data requirements. If you're looking to make a hybrid site where only _some_ pages are prerendered to static HTML, Next.js already does that automatically for you! Read up on [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md) for details.

## How to use it

Simply develop your app as you normally do with Next.js. Then run:

```bash
next build && next export
```

For that you may want to update the scripts in your `package.json` like this:

```json
"scripts": {
  "build": "next build && next export"
}
```

And run it with:

```bash
npm run build
```

Then you'll have a static version of your app in the `out` directory.

By default `next export` doesn't require any configuration. It will output a static HTML file for each page in your `pages` directory (except for [dynamic routes](https://nextjs.org/docs/routing/dynamic-routes), where it will call [`getStaticPaths`](https://nextjs.org/docs/basic-features/data-fetching#getstaticpaths-static-generation) and generate one or more pages based on the result). For more advanced scenarios, you can define a parameter called [`exportPathMap`](/docs/api-reference/next.config.js/exportPathMap.md) in your [`next.config.js`](https://nextjs.org/docs/api-reference/next.config.js/introduction) file to configure exactly which pages will be generated.

## Deployment

You can read about deploying your Next.js application in the [deployment section](/docs/deployment.md).

## Caveats

- With `next export`, we build an HTML version of your app. At export time, we call [`getStaticProps`](https://nextjs.org/docs/basic-features/data-fetching#getstaticprops-static-generation) for each page that exports it, and pass the result to the page's component. If you're using the older [`getInitialProps`](/docs/api-reference/data-fetching/getInitialProps.md) API instead of `getStaticProps`, the `req` and `res` fields of the [`context`](/docs/api-reference/data-fetching/getInitialProps.md#context-object) object will be empty objects, since during export there is no server running.
- You won't be able to render HTML dynamically when static exporting, as we pre-build the HTML files. Your application can be a hybrid of [Static Generation](/docs/basic-features/pages.md#static-generation) and [Server-Side Rendering](/docs/basic-features/pages.md#server-side-rendering) when you don't use `next export`. You can learn more about it in the [pages section](/docs/basic-features/pages.md).
- [API Routes](/docs/api-routes/introduction.md) are not supported by this method because they can't be prerendered to HTML.
