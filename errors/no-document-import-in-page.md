# No Document Import in Page

### Why This Error Occurred

`next/document` was imported in a page outside of `pages/_document.js`. This can cause unexpected issues in your application.

### Possible Ways to Fix It

Only import and use `next/document` within `pages/_document.js` to override the default `Document` component:

```jsx
// pages/_document.js
import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  //...
}

export default MyDocument
```

### Useful Links

- [Custom Document](https://nextjs.org/docs/advanced-features/custom-document)
