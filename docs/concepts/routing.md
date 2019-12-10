# Routing

Next.js has a file-system based router built on the [concept of pages](/docs/concepts/pages.md).

When a file is added to the `pages` directory it's automatically available as a route. For example:

- `pages/index.js` → `/`
- `pages/about.js` → `/about`
- `pages/dashboard/settings/username.js` → `/dashboard/settings/username` - Deeply nested directory
- `pages/blog/index.js` → `/blog` - Nested index files are mapped to the directory name
- `pages/blog/first-post.js` → `/blog/first-post`
- `pages/blog/[slug].js` → `/blog/:slug` - matching dynamic path segments

## Linking between pages

The Next.js router allows you to do client-side route transitions between pages, similarly to a single-page application.

A special React component called `Link` is provided to do this client-side route transition.

```jsx
import Link from 'next/link'

function Home() {
  return (
    <ul>
      <li>
        <Link href="/">
          <a>Home</a>
        </Link>
      </li>
      <li>
        <Link href="/about">
          <a>About Us</a>
        </Link>
      </li>
    </ul>
  )
}

export default Home
```

When linking to a route with [dynamic path segments](/docs/routing/dynamic-routes.md) you have to provide `href` and `as` to make sure the router knows which JavaScript file to load.

- `href` - The name of the page in the `pages` directory. For example `/blog/[slug]`.
- `as` - The url that will be shown in the browser. For example `/blog/hello-world`.

```jsx
import Link from 'next/link'

function Home() {
  return (
    <ul>
      <li>
        <Link href="/blog/[slug]" as="/blog/hello-world">
          <a>To Hello World Blog post</a>
        </Link>
      </li>
    </ul>
  )
}

export default Home
```

## Learn more

The router is divided in multiple parts:

- [`Link`](/docs/routing/using-link.md): The component that handles client-side navigation.
- [`useRouter`](/docs/routing/useRouter.md) and [`withRouter`](/docs/routing/withRouter.md): Allow your pages to access the [`router`](/docs/routing/router-object.md) in React components.
- [Router API](/docs/api-reference/router/router.push.md): Aimed at advanced usage.
