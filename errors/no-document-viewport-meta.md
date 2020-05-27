# Viewport `meta` tags should not be used in `_document.js`'s `<Head>`

#### Why This Error Occurred

Adding `<meta name="viewport" ...>` in `pages/_document.js` will lead to unexpected results since the viewport is handled by `next/head`.

#### Possible Ways to Fix It

Set your viewport `meta` tag in `pages/_app.js` instead:

```js
// pages/_app.js
import App from 'next/app'
import Head from 'next/head'
import React from 'react'

export default class MyApp extends App {
  static async getInitialProps({ Component, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return { pageProps }
  }

  render() {
    const { Component, pageProps } = this.props

    return (
      <>
        <Head>
          <meta name="viewport" content="viewport-fit=cover" />
        </Head>
        <Component {...pageProps} />
      </>
    )
  }
}
```

### Useful Links

- [Issue #13230](https://github.com/zeit/next.js/issues/13230), which led to the creation of this warning.
