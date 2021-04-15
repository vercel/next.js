# No HTML link for pages

### Why This Error Occurred

An HTML anchor element, `<a>`, was used to navigate to a page route without using the `<Link>` component.

This is needed for the Next.js router to enable client-side route transitions between pages, similar to a single-page application.

### Possible Ways to Fix It

Make sure to import the `<Link>` component and wrap anchor elements to route to different pages.

```tsx
import Link from 'next/link'

function Home() {
  return (
    <Link href="/about">
      <a>About Us</a>
    </Link>
  )
}

export default Home
```

### Useful Links

- [next/link API Reference](https://nextjs.org/docs/api-reference/next/link)
