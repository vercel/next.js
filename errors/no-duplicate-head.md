# No Duplicate Head

### Why This Error Occurred

More than a single instance of the `<Head />` component was used in a single custom document. This can cause unexpected behavior in your application.

### Possible Ways to Fix It

Only use a single `<Head />` component in your custom document in `pages/_document.js`.

```jsx
// pages/_document.js
import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    //...
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

### Useful Links

- [Custom Document](https://nextjs.org/docs/advanced-features/custom-document)
