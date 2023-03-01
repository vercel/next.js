---
description: Control page initialization and add a layout that persists for all pages by overriding the default App component used by Next.js.
---

# Custom `App`

> **Note**: Next.js 13 introduces the `app/` directory (beta). This new directory has support for layouts, nested routes, and uses Server Components by default. Inside `app/`, you can fetch data for your entire application inside layouts, including support for more granular nested layouts (with [colocated data fetching](https://beta.nextjs.org/docs/data-fetching/fundamentals)).
>
> [Learn more about incrementally adopting `app/`](https://beta.nextjs.org/docs/upgrade-guide).

Next.js uses the `App` component to initialize pages. You can override it and control the page initialization and:

- Persist layouts between page changes
- Keeping state when navigating pages
- Inject additional data into pages
- [Add global CSS](/docs/basic-features/built-in-css-support.md#adding-a-global-stylesheet)

To override the default `App`, create the file `./pages/_app.js` as shown below:

```jsx
export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}
```

The `Component` prop is the active `page`, so whenever you navigate between routes, `Component` will change to the new `page`. Therefore, any props you send to `Component` will be received by the `page`.

`pageProps` is an object with the initial props that were preloaded for your page by one of our [data fetching methods](/docs/basic-features/data-fetching/overview.md), otherwise it's an empty object.

The `App.getInitialProps` receives a single argument called `context.ctx`. It's an object with the same set of properties as the [`context` object](/docs/api-reference/data-fetching/get-initial-props#context-object) in `getInitialProps`.

### Caveats

- If your app is running and you added a custom `App`, you'll need to restart the development server. Only required if `pages/_app.js` didn't exist before.
- Adding a custom [`getInitialProps`](/docs/api-reference/data-fetching/get-initial-props.md) in your `App` will disable [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md) in pages without [Static Generation](/docs/basic-features/data-fetching/get-static-props.md).
- When you add `getInitialProps` in your custom app, you must `import App from "next/app"`, call `App.getInitialProps(appContext)` inside `getInitialProps` and merge the returned object into the return value.
- `App` does not support Next.js [Data Fetching methods](/docs/basic-features/data-fetching/overview.md) like [`getStaticProps`](/docs/basic-features/data-fetching/get-static-props.md) or [`getServerSideProps`](/docs/basic-features/data-fetching/get-server-side-props.md). If you need global data fetching, consider [incrementally adopting the `app/` directory](https://beta.nextjs.org/docs/upgrade-guide).

### TypeScript

If you’re using TypeScript, take a look at [our TypeScript documentation](/docs/basic-features/typescript.md#custom-app).

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/advanced-features/automatic-static-optimization.md">
    <b>Automatic Static Optimization:</b>
    <small>Next.js automatically optimizes your app to be static HTML whenever possible. Learn how it works here.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/advanced-features/custom-error-page.md">
    <b>Custom Error Page:</b>
    <small>Learn more about the built-in Error page.</small>
  </a>
</div>
