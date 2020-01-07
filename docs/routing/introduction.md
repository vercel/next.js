---
description: Next.js has a built-in, opinionated, and file-system based Router. You can learn how it works here.
---

# Routing

Next.js has a file-system based router built on the [concept of pages](/docs/basic-features/pages.md).

When a file is added to the `pages` directory it's automatically available as a route.

The files inside the `pages` directory can be used to define most common patterns.

#### Index routes

The router will automatically route files named `index` to the root of the directory.

- `pages/index.js` → `/`
- `pages/blog/index.js` → `/blog`

#### Nested routes

The router supports nested files. If you create a nested folder structure files will be automatically routed in the same way still.

- `pages/blog/first-post.js` → `/blog/first-post`
- `pages/dashboard/settings/username.js` → `/dashboard/settings/username`

#### Dynamic route segments

To match a dynamic segment you can use the bracket syntax. This allows you to match named parameters.

- `pages/blog/[slug].js` → `/blog/:slug` (`/blog/hello-world`)
- `pages/[username]/settings.js` → `/:username/settings` (`/foo/settings`)
- `pages/post/[...all]` → `/post/*` (`/post/2020/id/title`)

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

## Injecting the router

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/dynamic-routing">Dynamic Routing</a></li>
  </ul>
</details>

To access the [`router` object](/docs/api-reference/next/router.md#router-object) in a React component you can use [`useRouter`](/docs/api-reference/next/router.md#useRouter) or [`withRouter`](/docs/api-reference/next/router.md#withRouter).

In general we recommend using [`useRouter`](/docs/api-reference/next/router.md#useRouter).

## Learn more

The router is divided in multiple parts:

<div class="card">
  <a href="/docs/api-reference/next/link.md">
    <b>next/link:</b>
    <small>Handle client-side navigations.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/api-reference/next/router.md">
    <b>next/router:</b>
    <small>Leverage the router API in your pages.</small>
  </a>
</div>
