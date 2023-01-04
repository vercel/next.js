# No HTML link for pages

> Prevent usage of `<a>` elements to navigate to internal Next.js pages.

### Why This Error Occurred

An `<a>` element was used to navigate to a page route without using the `next/link` component, causing unnecessary full page refreshes.

The `Link` component is required in order to enable client-side route transitions between pages and provide a single-page app experience.

### Possible Ways to Fix It

Make sure to import the `Link` component and wrap anchor elements that route to different page routes.

**Before:**

```jsx
function Home() {
  return (
    <div>
      <a href="/about">About Us</a>
    </div>
  )
}
```

**After:**

```jsx
import Link from 'next/link'

function Home() {
  return (
    <div>
      <Link href="/about">
        <a>About Us</a>
      </Link>
    </div>
  )
}

export default Home
```

### Options

#### `pagesDir`

This rule can normally locate your `pages` directory automatically.

If you're working in a monorepo, we recommend configuring the [`rootDir`](/docs/basic-features/eslint.md#rootDir) setting in `eslint-plugin-next`, which `pagesDir` will use to locate your `pages` directory.

In some cases, you may also need to configure this rule directly by providing a `pages` directory. This can be a path or an array of paths.

```json
{
  "rules": {
    "@next/next/no-html-link-for-pages": ["error", "packages/my-app/pages/"]
  }
}
```

### Useful Links

- [next/link API Reference](https://nextjs.org/docs/api-reference/next/link)
