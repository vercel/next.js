# `<title>` should not be used in _document.js's `<Head>`

#### Why This Error Occurred

Adding `<title>` in `pages/_document.js` will lead to unexpected results with `next/head` since `_document.js` is only rendered on the initial pre-render.

#### Possible Ways to Fix It

Set `<title>` in `pages/_app.js` instead :

```js
// pages/_app.js
import App, {Container} from 'next/app'
import Head from 'next/head'
import React from 'react'

export default class MyApp extends App {
  static async getInitialProps ({ Component, router, ctx }) {
    let pageProps = {}

    if (Component.getInitialProps) {
      pageProps = await Component.getInitialProps(ctx)
    }

    return {pageProps}
  }

  render () {
    const {Component, pageProps} = this.props
    return <Container>
      <Head>
        <title>My new cool app</title>
      </Head>
      <Component {...pageProps} />
    </Container>
  }
}
```


### Useful Links

- [The issue this was reported in: #4596](https://github.com/zeit/next.js/issues/4596)
