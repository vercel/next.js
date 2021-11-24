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

`next export` allows you to export your app to static HTML, which can be run standalone without the need of a Node.js server.

The exported app supports almost every feature of Next.js, including dynamic routes, prefetching, preloading and dynamic imports.

`next export` works by prerendering all pages to HTML. For [dynamic routes](/docs/routing/dynamic-routes.md), your page can export a [`getStaticPaths`](/docs/basic-features/data-fetching.md#getstaticpaths-static-generation) function to let the exporter know which HTML pages to generate for that route.

> `next export` is intended for scenarios where **none** of your pages have server-side or incremental data requirements (though statically-rendered pages can still [fetch data on the client side](/docs/basic-features/data-fetching.md#fetching-data-on-the-client-side) just fine).
>
> If you're looking to make a hybrid site where only _some_ pages are prerendered to static HTML, Next.js already does that automatically for you! Read up on [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md) for details.
>
> `next export` also causes features like [Incremental Static Generation](/docs/basic-features/data-fetching.md#fallback-true) and [Regeneration](/docs/basic-features/data-fetching.md#incremental-static-regeneration) to be disabled, as they require [`next start`](/docs/api-reference/cli.md#production) or a serverless deployment to function.

## How to use it

Develop your app as you normally do with Next.js. Then run:

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

By default `next export` doesn't require any configuration.
It will output a static HTML file for each page in your `pages` directory (or more for [dynamic routes](/docs/routing/dynamic-routes.md), where it will call [`getStaticPaths`](/docs/basic-features/data-fetching.md#getstaticpaths-static-generation) and generate pages based on the result).
For more advanced scenarios, you can define a parameter called [`exportPathMap`](/docs/api-reference/next.config.js/exportPathMap.md) in your [`next.config.js`](/docs/api-reference/next.config.js/introduction.md) file to configure exactly which pages will be generated.

## Deployment

By default, `next export` will generate an `out` directory, which can be served by any static hosting service or CDN.

> We strongly recommend using [Vercel](https://vercel.com/) even if your Next.js app is fully static. [Vercel](https://vercel.com/) is optimized to make static Next.js apps blazingly fast. `next export` works with Zero Config deployments on Vercel.

## Caveats

- With `next export`, we build an HTML version of your app. At export time, we call [`getStaticProps`](/docs/basic-features/data-fetching.md#getstaticprops-static-generation) for each page that exports it, and pass the result to the page's component. It's also possible to use the older [`getInitialProps`](/docs/api-reference/data-fetching/getInitialProps.md) API instead of `getStaticProps`, but it comes with a few caveats:

  - `getInitialProps` cannot be used alongside `getStaticProps` or `getStaticPaths` on any given page. If you have dynamic routes, instead of using `getStaticPaths` you'll need to configure the [`exportPathMap`](/docs/api-reference/next.config.js/exportPathMap.md) parameter in your [`next.config.js`](/docs/api-reference/next.config.js/introduction.md) file to let the exporter know which HTML files it should output.
  - When `getInitialProps` is called during export, the `req` and `res` fields of its [`context`](/docs/api-reference/data-fetching/getInitialProps.md#context-object) parameter will be empty objects, since during export there is no server running.
  - `getInitialProps` **will be called on every client-side navigation**, if you'd like to only fetch data at build-time, switch to `getStaticProps`.
  - `getInitialProps` should fetch from an API and cannot use Node.js-specific libraries or the file system like `getStaticProps` can.

  It's recommended to use and migrate towards `getStaticProps` over `getInitialProps` whenever possible.

- The [`fallback: true`](/docs/basic-features/data-fetching.md#fallback-true) mode of `getStaticPaths` is not supported when using `next export`.
- [API Routes](/docs/api-routes/introduction.md) are not supported by this method because they can't be prerendered to HTML.
- [`getServerSideProps`](/docs/basic-features/data-fetching.md#getserversideprops-server-side-rendering) cannot be used within pages because the method requires a server. Consider using [`getStaticProps`](/docs/basic-features/data-fetching.md#getstaticprops-static-generation) instead.
- [Internationalized Routing](/docs/advanced-features/i18n-routing.md) is not supported as it requires Next.js' server-side routing.
- The [`next/image`](/docs/api-reference/next/image.md) component's default loader is not supported when using `next export`. However, other [loader](/docs/basic-features/image-optimization.md#loader) options will work.
