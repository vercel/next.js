# No Head Import in Document

### Why This Error Occurred

`next/head` was imported in `pages/_document.js`. This can cause unexpected issues in your application.

### Possible Ways to Fix It

Only import and use `next/document` within `pages/_document.js` to override the default `Document` component. If you are importing `next/head` to use the `Head` component, import it from `next/document` instead in order to modify `<head>` code across all pages:

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
        <Head></Head>
      </Html>
    )
  }
}

export default MyDocument
```

### Useful Links

- [Custom Document](https://nextjs.org/docs/advanced-features/custom-document)
