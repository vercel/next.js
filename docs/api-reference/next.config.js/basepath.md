---
description: Learn more about setting a base path in Next.js
---

# Base Path

<details>
  <summary><b>Version History</b></summary>

| Version  | Changes          |
| -------- | ---------------- |
| `v9.5.0` | Base Path added. |

</details>

To deploy a Next.js application under a sub-path of a domain you can use the `basePath` config option.

`basePath` allows you to set a path prefix for the application. For example, to use `/docs` instead of `/` (the default), open `next.config.js` and add the `basePath` config:

```js
module.exports = {
  basePath: '/docs',
}
```

Note: this value must be set at build time and can not be changed without re-building as the value is inlined in the client-side bundles.

## Links

When linking to other pages using `next/link` and `next/router` the `basePath` will be automatically applied.

For example, using `/about` will automatically become `/docs/about` when `basePath` is set to `/docs`.

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

## Images

When using the [`next/image`](/docs/api-reference/next/image.md) component, you will need to add the `basePath` in front of `src`.

For example, using `/docs/me.png` will properly serve your image when `basePath` is set to `/docs`.

```jsx
import Image from 'next/image'

function Home() {
  return (
    <>
      <h1>My Homepage</h1>
      <Image
        src="/docs/me.png"
        alt="Picture of the author"
        width={500}
        height={500}
      />
      <p>Welcome to my homepage!</p>
    </>
  )
}

export default Home
```
