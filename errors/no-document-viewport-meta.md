# Viewport `meta` tags should not be used in `_document.js`'s `<Head>`

#### Why This Error Occurred

Adding `<meta name="viewport" ...>` in `pages/_document.js` will lead to unexpected results since the viewport is handled by `next/head`.

#### Possible Ways to Fix It

Set your viewport `meta` tag in `pages/_app.js` instead:

```jsx
// pages/_app.js
import React from 'react'
import Head from 'next/head'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="viewport-fit=cover" />
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

- [Issue #13230](https://github.com/zeit/next.js/issues/13230), which led to the creation of this warning.
