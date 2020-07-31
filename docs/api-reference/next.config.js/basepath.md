---
description: Learn more about setting a base path in Next.js
---

# Base Path

> This feature was introduced in [Next.js 9.5](https://nextjs.org/blog/next-9-5) and up. If you’re using older versions of Next.js, please upgrade before trying it out.

To deploy a Next.js application under a sub-path of a domain you can use the `basePath` option.

`basePath` allows you to set a path prefix for the application. For example `/docs` instead of `/` (the default).

For example, to set the base path to `/docs`, set the following configuration in `next.config.js`:

```js
module.exports = {
  basePath: '/docs',
}
```

## Links

When linking to other pages using `next/link` and `next/router` the `basePath` will be automatically applied.

For example using `/about` will automatically become `/docs/about` when `basePath` is set to `/docs`.

```js
export default function HomePage() {
  return (
    <>
      <Link href="/about">
        <a>About Page</a>
      </Link>
    </>
  )
}
```

Output html:

```html
<a href="/docs/about">About Page</a>
```

This makes sure that you don't have to change all links in your application when changing the `basePath` value.
