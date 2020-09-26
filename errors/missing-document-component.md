# Missing Document Components

#### Why This Error Occurred

In your custom `pages/_document` an expected sub-component was not rendered.

#### Possible Ways to Fix It

Make sure to import and render all of the expected `Document` components:

- `<Html />`
- `<Head />`
- `<Main />`
- `<NextScript />`

For example:

```tsx
import Document, { Html, Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
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
```

### Useful Links

- [Custom Document Docs](https://nextjs.org/docs/advanced-features/custom-document)
