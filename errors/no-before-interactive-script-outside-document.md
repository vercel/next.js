# No Before Interactive Script Outside Document

> Prevent usage of `next/script`'s `beforeInteractive` strategy outside of `pages/_document.js`.

#### Why This Error Occurred

You cannot use the `next/script` component with the `beforeInteractive` strategy outside `pages/_document.js`. That's because `beforeInteractive` strategy only works inside **`pages/_document.js`** and is designed to load scripts that are needed by the entire site (i.e. the script will load when any page in the application has been loaded server-side).

#### Possible Ways to Fix It

If you want a global script, move the script inside `pages/_document.js`.

```jsx
// In `pages/_document.js`
import { Html, Head, Main, NextScript } from 'next/document'
import Script from 'next/script'

export default function Document() {
  return (
    <Html>
      <Head />
      <body>
        <Main />
        <NextScript />
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.20/lodash.min.js"
          strategy="beforeInteractive"
        ></Script>
      </body>
    </Html>
  )
}
```

- [next-script](https://nextjs.org/docs/basic-features/script#usage)
