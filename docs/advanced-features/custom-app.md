---
description: Control page initialization and add a layout that persists for all pages by overriding the default App component used by Next.js.
---

# Custom `App`

Next.js uses the `App` component to initialize pages. You can override it and control the page initialization. Which allows you to do amazing things like:

- Persisting layout between page changes
- Keeping state when navigating pages
- Custom error handling using `componentDidCatch`
- Inject additional data into pages

To override the default `App`, create the file `./pages/_app.js` as shown below:

```jsx
// import App from 'next/app'

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

// Only uncomment this method if you have blocking data requirements for
// every single page in your application. This disables the ability to
// perform automatic static optimization, causing every page in your app to
// be server-side rendered.
//
// MyApp.getInitialProps = async (appContext) => {
//   // calls page's `getInitialProps` and fills `appProps.pageProps`
//   const appProps = await App.getInitialProps(appContext);
//
//   return { ...appProps }
// }

export default MyApp
```

The `Component` prop is the active `page`, so whenever you navigate between routes, `Component` will change to the new `page`. Therefore, any props you send to `Component` will be received by the `page`.

`pageProps` is an object with the initial props that were preloaded for your page, it's an empty object if the page is not using [`getInitialProps`](/docs/api-reference/data-fetching/getInitialProps.md).

> Adding a custom `getInitialProps` in your `App` will disable [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md).

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/advanced-features/automatic-static-optimization.md">
    <b>Automatic Static Optimization:</b>
    <small>Learn more about how Next.js automatically optimizes your pages.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/advanced-features/custom-error-page.md">
    <b>Custom Error Page:</b>
    <small>Learn more about the built-in Error page.</small>
  </a>
</div>
