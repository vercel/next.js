# `<title>` should not be used in \_document.js's `<Head>`

#### Why This Error Occurred

Adding `<title>` in `pages/_document.js` will lead to unexpected results with `next/head` since `_document.js` is only rendered on the initial pre-render.

#### Possible Ways to Fix It

Set `<title>` in `pages/_app.js` instead:

```js
// pages/_app.js
import React from 'react'
import Head from 'next/head'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>My new cool app</title>
      </Head>
      <Component {...pageProps} />
    </>
  )
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

### Useful Links

- [The issue this was reported in: #4596](https://github.com/zeit/next.js/issues/4596)
