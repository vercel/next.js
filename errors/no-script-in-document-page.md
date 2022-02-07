# Script component inside \_document.js

#### Why This Error Occurred

You can't use the `next/script` component inside the `_document.js` page. That's because the `_document.js` page only runs on the server and `next/script` has client-side functionality to ensure loading order.

#### Possible Ways to Fix It

If you want a global script, instead use the `_app.js` page.

```jsx
import Script from 'next/script'

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Script src="/my-script.js" />
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
```

- [custom-app](https://nextjs.org/docs/advanced-features/custom-app)
- [next-script](https://nextjs.org/docs/basic-features/script#usage)
