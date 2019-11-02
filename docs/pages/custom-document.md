# Custom `<Document>`

A custom `<Document>` is commonly used to augment your application's `<html>` and `<body>` tags. This is necessary because Next.js pages skip the definition of the surrounding document's markup.

A custom `<Document>` can also include `getInitialProps` for expressing asynchronous server-rendering data requirements.

To override the default `<Document>`, create the file `./pages/_document.js` and extend the `Document` class as shown below:

```jsx
import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

  render() {
    return (
      <Html>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
```

`<Html>`, `<Head />`, `<Main />` and `<NextScript />` are required for the page to be properly rendered.

The `ctx` object is equivalent to the one received in [`getInitialProps`](https://www.notion.so/zeithq/Custom-Document-b9ece843914443519c952a53ecc4d389#fetching-data-and-component-lifecycle), with one addition:

- `renderPage`: `Function` - a callback that executes the actual React rendering logic (synchronously). It's useful to decorate this function in order to support server-rendering wrappers like Aphrodite's [`renderStatic`](https://github.com/Khan/aphrodite#server-side-rendering)

## Caveats

- `<Document>` is only rendered in the server, event handlers like `onClick` won't work
- React components outside of `<Main />` will not be initialized by the browser. Do _not_ add application logic here. If you need shared components in all your pages (like a menu or a toolbar), take a look at the [`<App>`](https://www.notion.so/zeithq/Custom-App-ee9e71d6b13848f1b58ae97b6690508a) component instead
- `<Document>`'s `getInitialProps` function is not called during client-side transitions, nor when a page is [statically optimized](https://www.notion.so/zeithq/Automatic-Static-Optimization-172e00fb49b548f9ab196a5bf754ca2d)
- Make sure to check if `ctx.req` / `ctx.res` are defined in `getInitialProps`. Those variables will be `undefined` when a page is being statically exported by [Automatic Static Optimization](https://www.notion.so/zeithq/Automatic-Static-Optimization-172e00fb49b548f9ab196a5bf754ca2d) or by [`next export`](https://www.notion.so/zeithq/Static-HTML-export-2657c5c1bbcd457a94562194f944978c).

## Customizing `renderPage`

> It should be noted that the only reason you should be customizing `renderPage` is for usage with **css-in-js** libraries that need to wrap the application to properly work with server-side rendering.

It takes as argument an options object for further customization:

```jsx
import Document from 'next/document'

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const originalRenderPage = ctx.renderPage

    ctx.renderPage = () =>
      originalRenderPage({
        // useful for wrapping the whole react tree
        enhanceApp: App => App,
        // useful for wrapping in a per-page basis
        enhanceComponent: Component => Component,
      })

    // Run the parent `getInitialProps`, it now includes the custom `renderPage`
    const initialProps = await Document.getInitialProps(ctx)

    return initialProps
  }
}

export default MyDocument
```
