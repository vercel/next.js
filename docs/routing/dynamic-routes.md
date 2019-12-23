# Dynamic Routes

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/dynamic-routing">Dynamic Routing</a></li>
  </ul>
</details>

Defining routes by using predefined paths is not always enough for complex applications, in Next.js you can add brackets to a page (`[param]`) to create a dynamic route (a.k.a. url slugs, pretty urls, and others).

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

Client-side navigations to a dynamic route can be handled with [`next/link`](/docs/api-reference/next/link.md#dynamic-routes).

## Caveats

- Predefined routes take precedence over dynamic routes. Take a look at the following examples:
  - `pages/post/create.js` - Will match `/post/create`
  - `pages/post/[pid].js` - Will match `/post/1`, `/post/abc`, etc. but not `/post/create`
- Pages that are statically optimized by [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md) will be hydrated without their route parameters provided, i.e `query` will be an empty object (`{}`).

  After hydration, Next.js will trigger an update to your application to provide the route parameters in the `query` object.
