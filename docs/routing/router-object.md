# Router Object

The following is the definition of the `router` object returned by both [`useRouter`](/docs/routing/useRouter.md) and [`withRouter`](/docs/routing/withRouter.md):

- `route`: `String` - Current route
- `pathname`: `String` - Current path excluding the query string
- `query`: `Object` - The query string parsed to an object. Defaults to `{}`
- `asPath`: `String` - Actual path (including the query) shown in the browser

Additionally, useful methods from the `Router API` are also included:

- `push(url, as=url)` - Performs a `pushState` call with the given url
- `replace(url, as=url)` - Performs a `replaceState` call with the given url
- `beforePopState(cb=function)` - intercepts _popstate_ before the router processes the event

The second `as` parameter for `push` and `replace` is an optional decoration of the URL. Useful for dynamic routes.

> The `query` object will be empty during prerendering if the page is [statically optimized](/docs/advanced-features/automatic-static-optimization.md).
