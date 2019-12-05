# Static HTML Export

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-static-export">Static Export</a></li>
  </ul>
</details>

`next export` allows you to export your app to static HTML, which can be run standalone without the need of a Node.js server.

The exported app supports almost every feature of Next.js, including dynamic routes, prefetching, preloading and dynamic imports.

The way `next export` works is by prerendering all pages to HTML; it does so based on a mapping mapping called [`exportPathMap`](/docs/api-reference/next.config.js/exportPathMap.md).

> If your pages don't have `getInitialProps` you may not need `next export` at all, `next build` is already enough thanks to [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md).

## How to use it

Simply develop your app as you normally do with Next.js. Then run:

```bash
next build
next export
```

For that you may want to update the scripts in your `package.json` like this:

```json
"scripts": {
  "build": "next build",
  "export": "npm run build && next export"
}
```

And run it at once with:

```bash
npm run export
```

Then you'll have a static version of your app in the `out` directory.

> You can also customize the output directory. Run `next export -o my-custom-dir`.

By default `next export` doesn't require any configuration. It will generate a default `exportPathMap` with routes for the pages inside the `pages` directory.

> To learn more about `exportPathMap` please visit the [documentation for the `exportPathMap` API](/docs/api-reference/next.config.js/exportPathMap.md).

## Deployment

Once you have the exported app in the `out` directory, you can deploy it to any static hosting service.

For example, simply visit the `out` directory and run following command to deploy your app to [ZEIT Now](https://zeit.co/home):

```bash
cd out && now
```

A deployment to GitHub Pages has an additional step, [documented here](https://github.com/zeit/next.js/wiki/Deploying-a-Next.js-app-into-GitHub-Pages).

## Caveats

- With `next export`, we build a HTML version of your app. At export time we will run the [`getInitialProps`](/docs/pages/ssr-with-getInitialProps.md) in your pages. The `req` and `res` fields of the [`context`](/docs/pages/ssr-with-getInitialProps.md#context-object) object will be empty objects during export as there is no server running
- You won't be able to render HTML dynamically when static exporting, as we pre-build the HTML files. If you need to do dynamic rendering use Next.js without this feature
- [API Routes](/docs/api-routes/introduction.md) are not supported by this method because they can't be prerendered to HTML
