# Opt-out of Automatic Static Optimization

#### Why This Warning Occurred

You are using `getInitialProps` in your [Custom `<App>`](https://nextjs.org/docs/advanced-features/custom-app).

This causes **all pages** to be executed on the server -- disabling [Automatic Static Optimization](https://nextjs.org/docs/advanced-features/automatic-static-optimization).

#### Possible Ways to Fix It

Be sure you meant to use `getInitialProps` in `pages/_app`!
There are some valid use cases for this, but it is often better to handle `getInitialProps` on a _per-page_ basis.

If you previously copied the [Custom `<App>`](https://nextjs.org/docs/advanced-features/custom-app) example, you may be able to remove your `getInitialProps`.

The following `getInitialProps` does nothing and may be removed:

```js
class MyApp extends App {
  // Remove me, I do nothing!
  static async getInitialProps({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render() {
    // ...
  }
}
```
