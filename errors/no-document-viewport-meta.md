# Viewport `meta` tags should not be used in `_document.js`'s `<Head>`

#### Why This Error Occurred

Adding `<meta name="viewport" ...>` in `pages/_document.js` will lead to unexpected results since it cannot be deduped.
The viewport tag should be handled by `next/head` in `pages/_app.js`.

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

export default MyApp
```

### Useful Links

- [Issue #13230](https://github.com/zeit/next.js/issues/13230), which led to the creation of this warning.
