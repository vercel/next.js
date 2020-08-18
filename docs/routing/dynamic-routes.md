---
description: Dynamic Routes are pages that allow you to add custom params to your URLs. Start creating Dynamic Routes and learn more here.
---

# Dynamic Routes

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/dynamic-routing">Dynamic Routing</a></li>
  </ul>
</details>

Defining routes by using predefined paths is not always enough for complex applications. In Next.js you can add brackets to a page (`[param]`) to create a dynamic route (a.k.a. url slugs, pretty urls, and others).

Consider the following page `pages/post/[pid].js`:

```jsx
import { useRouter } from 'next/router'

const Post = () => {
  const router = useRouter()
  const { pid } = router.query

  return <p>Post: {pid}</p>
}

export default Post
```

Any route like `/post/1`, `/post/abc`, etc. will be matched by `pages/post/[pid].js`. The matched path parameter will be sent as a query parameter to the page, and it will be merged with the other query parameters.

For example, the route `/post/abc` will have the following `query` object:

```json
{ "pid": "abc" }
```

Similarly, the route `/post/abc?foo=bar` will have the following `query` object:

```json
{ "foo": "bar", "pid": "abc" }
```

However, route parameters will override query parameters with the same name. For example, the route `/post/abc?pid=123` will have the following `query` object:

```json
{ "pid": "abc" }
```

Multiple dynamic route segments work the same way. The page `pages/post/[pid]/[comment].js` will match the route `/post/abc/a-comment` and its `query` object will be:

```json
{ "pid": "abc", "comment": "a-comment" }
```

**Note:** Client-side navigations to a dynamic route (including [catch all routes](#catch-all-routes)) can be handled with [`next/link`](/docs/api-reference/next/link.md#dynamic-routes). Read our docs for [Linking between pages](/docs/routing/introduction#linking-between-pages) to learn more.

### Catch all routes

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/catch-all-routes">Catch All Routes</a></li>
  </ul>
</details>

Dynamic routes can be extended to catch all paths by adding three dots (`...`) inside the brackets. For example:

- `pages/post/[...slug].js` matches `/post/a`, but also `/post/a/b`, `/post/a/b/c` and so on.

> **Note**: You can use names other than `slug`, such as: `[...param]`

Matched parameters will be sent as a query parameter (`slug` in the example) to the page, and it will always be an array, so, the path `/post/a` will have the following `query` object:

```json
{ "slug": ["a"] }
```

And in the case of `/post/a/b`, and any other matching path, new parameters will be added to the array, like so:

```json
{ "slug": ["a", "b"] }
```

### Optional catch all routes

Catch all routes can be made optional by including the parameter in double brackets (`[[...slug]]`).

For example, `pages/post/[[...slug]].js` will match `/post`, `/post/a`, `/post/a/b`, and so on.

The main difference between catch all and optional catch all routes is that with optional, the route without the parameter is also matched (`/post` in the example above).

The `query` objects are as follows:

```json
{ } // GET `/post` (empty object)
{ "slug": ["a"] } // `GET /post/a` (single-element array)
{ "slug": ["a", "b"] } // `GET /post/a/b` (multi-element array)
```

> A good example of optional catch all routes is the Next.js docs, a single page called [pages/docs/[[...slug]].js](https://github.com/vercel/next-site/blob/master/pages/docs/%5B%5B...slug%5D%5D.js) takes care of all the docs you're currently looking at.

## Caveats

- Predefined routes take precedence over dynamic routes, and dynamic routes over catch all routes. Take a look at the following examples:
  - `pages/post/create.js` - Will match `/post/create`
  - `pages/post/[pid].js` - Will match `/post/1`, `/post/abc`, etc. But not `/post/create`
  - `pages/post/[...slug].js` - Will match `/post/1/2`, `/post/a/b/c`, etc. But not `/post/create`, `/post/abc`
- Pages that are statically optimized by [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md) will be hydrated without their route parameters provided, i.e `query` will be an empty object (`{}`).
- When routing to a dynamic route using `Link` or `router`, you will need to specify the `href` as the dynamic route, for example `/post/[pid]` and `as` as the decorator for the URL, for example `/post/abc`.

  After hydration, Next.js will trigger an update to your application to provide the route parameters in the `query` object.
