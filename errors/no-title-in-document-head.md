# No Title in Document Head

### Why This Error Occurred

A `<title>` element was defined within the `Head` component imported from `next/document`, which should only be used for any `<head>` code that is common for all pages. Title tags should be defined at the page-level using `next/head`.

### Possible Ways to Fix It

Within a page or component, import and use `next/head` to define a page title:

```jsx
import Head from 'next/head'

export class Home {
  render() {
    return (
      <div>
        <Head>
          <title>My page title</title>
        </Head>
      </div>
    )
  }
}
```

### Useful links

- [next/head](https://nextjs.org/docs/api-reference/next/head)
- [Custom Document](https://nextjs.org/docs/advanced-features/custom-document)
