# No HTML link for pages

### Why This Error Occurred

An HTML anchor element, `<a>`, was used to navigate to a page route without using the `Link` component.

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

### Useful Links

- [next/link API Reference](https://nextjs.org/docs/api-reference/next/link)
