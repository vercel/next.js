---
title: not-found.js
description: API reference for the not-found.js file.
---

Next.js provides two conventions to handle not found cases:

- **`not-found.js`**: Used when you call the [`notFound`](/docs/app/api-reference/functions/not-found) function in a route segment.
- **`global-not-found.js`**: Used to define a global 404 page for unmatched routes across your entire app. This is handled at the routing level and doesn't depend on rendering a layout or page.

## `not-found.js`

The **not-found** file is used to render UI when the [`notFound`](/docs/app/api-reference/functions/not-found) function is thrown within a route segment. Along with serving a custom UI, Next.js will return a `200` HTTP status code for streamed responses, and `404` for non-streamed responses.

```tsx filename="app/not-found.tsx" switcher
import Link from 'next/link'

export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
      <p>Could not find requested resource</p>
      <Link href="/">Return Home</Link>
    </div>
  )
}
```

```jsx filename="app/blog/not-found.js" switcher
import Link from 'next/link'

export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
      <p>Could not find requested resource</p>
      <Link href="/">Return Home</Link>
    </div>
  )
}
```

## `global-not-found.js` (experimental)

The `global-not-found.js` file lets you define a 404 page for your entire application. Unlike `not-found.js`, which works at the route level, this is used when a requested URL doesn't match any route at all. Next.js **skips rendering** and directly returns this global page.

The `global-not-found.js` file bypasses your app's normal rendering, which means you'll need to import any global styles, fonts, or other dependencies that your 404 page requires.

> **Good to know**: A smaller version of your global styles, and a simpler font family could improve performance of this page.

`global-not-found.js` is useful when you can't build a 404 page using a combination of `layout.js` and `not-found.js`. This can happen in two cases:

- Your app has multiple root layouts (e.g. `app/(admin)/layout.tsx` and `app/(shop)/layout.tsx`), so there's no single layout to compose a global 404 from.
- Your root layout is defined using top-level dynamic segments (e.g. `app/[country]/layout.tsx`), which makes composing a consistent 404 page harder.

To enable it, add the `globalNotFound` flag in `next.config.ts`:

```tsx filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    globalNotFound: true,
  },
}

export default nextConfig
```

Then, create a file in the root of the `app` directory: `app/global-not-found.js`:

```tsx filename="app/global-not-found.tsx" switcher
// Import global styles and fonts
import './globals.css'
import { Inter } from 'next/font/google'
import type { Metadata } from 'next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '404 - Page Not Found',
  description: 'The page you are looking for does not exist.',
}

export default function GlobalNotFound() {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <h1>404 - Page Not Found</h1>
        <p>This page does not exist.</p>
      </body>
    </html>
  )
}
```

```jsx filename="app/global-not-found.js" switcher
// Import global styles and fonts
import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: '404 - Page Not Found',
  description: 'The page you are looking for does not exist.',
}

export default function GlobalNotFound() {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <h1>404 - Page Not Found</h1>
        <p>This page does not exist.</p>
      </body>
    </html>
  )
}
```

Unlike `not-found.js`, this file must return a full HTML document, including `<html>` and `<body>` tags.

## Reference

### Props

`not-found.js` or `global-not-found.js` components do not accept any props.

> **Good to know**: In addition to catching expected `notFound()` errors, the root `app/not-found.js` and `app/global-not-found.js` files handle any unmatched URLs for your whole application. This means users that visit a URL that is not handled by your app will be shown the exported UI.

## Examples

### Data Fetching

By default, `not-found` is a Server Component. You can mark it as `async` to fetch and display data:

```tsx filename="app/not-found.tsx" switcher
import Link from 'next/link'
import { headers } from 'next/headers'

export default async function NotFound() {
  const headersList = await headers()
  const domain = headersList.get('host')
  const data = await getSiteData(domain)
  return (
    <div>
      <h2>Not Found: {data.name}</h2>
      <p>Could not find requested resource</p>
      <p>
        View <Link href="/blog">all posts</Link>
      </p>
    </div>
  )
}
```

```jsx filename="app/not-found.jsx" switcher
import Link from 'next/link'
import { headers } from 'next/headers'

export default async function NotFound() {
  const headersList = await headers()
  const domain = headersList.get('host')
  const data = await getSiteData(domain)
  return (
    <div>
      <h2>Not Found: {data.name}</h2>
      <p>Could not find requested resource</p>
      <p>
        View <Link href="/blog">all posts</Link>
      </p>
    </div>
  )
}
```

If you need to use Client Component hooks like `usePathname` to display content based on the path, you must fetch data on the client-side instead.

### Metadata

For `global-not-found.js`, you can export a `metadata` object or a [`generateMetadata`](/docs/app/api-reference/functions/generate-metadata) function to customize the `<title>`, `<meta>`, and other head tags for your 404 page:

> **Good to know**: Next.js automatically injects `<meta name="robots" content="noindex" />` for pages that return a 404 status code, including `global-not-found.js` pages.

```tsx filename="app/global-not-found.tsx" switcher
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Not Found',
  description: 'The page you are looking for does not exist.',
}

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <div>
          <h1>Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </div>
      </body>
    </html>
  )
}
```

```jsx filename="app/global-not-found.js" switcher
export const metadata = {
  title: 'Not Found',
  description: 'The page you are looking for does not exist.',
}

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <div>
          <h1>Not Found</h1>
          <p>The page you are looking for does not exist.</p>
        </div>
      </body>
    </html>
  )
}
```

## Version History

| Version   | Changes                                             |
| --------- | --------------------------------------------------- |
| `v15.4.0` | `global-not-found.js` introduced (experimental).    |
| `v13.3.0` | Root `app/not-found` handles global unmatched URLs. |
| `v13.0.0` | `not-found` introduced.                             |
