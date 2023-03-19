# No Page Custom Font

> Prevent page-only custom fonts.

### Why This Error Occurred

- The custom font you're adding was added to a page - this only adds the font to the specific page and not the entire application.
- The custom font you're adding was added to a separate component within `pages/_document.js` - this disables automatic font optimization.

### Possible Ways to Fix It

Create the file `./pages/_document.js` and add the font to a custom Document:

```jsx
// pages/_document.js

import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <link
            href="https://fonts.googleapis.com/css2?family=Inter&display=optional"
            rel="stylesheet"
          />
        </Head>
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

Or as a function component:

```js
// pages/_document.js

import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html>
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter&display=optional"
          rel="stylesheet"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
```

### When Not To Use It

If you have a reason to only load a font for a particular page or don't care about font optimization, then you can disable this rule.

### Useful Links

- [Custom Document](https://nextjs.org/docs/advanced-features/custom-document)
- [Font Optimization](https://nextjs.org/docs/basic-features/font-optimization)
