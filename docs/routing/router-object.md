# Router Object

The following is the definition of the `router` object returned by both [`useRouter`](https://www.notion.so/zeithq/useRouter-9366b2aaca924f3db8bed5a43aa887ad) and [`withRouter`](https://www.notion.so/zeithq/withRouter-ebcdae351eae4b8f84db2f2a26d0e505):

- `route`: `String` - Current route
- `pathname`: `String` - Current path excluding the query string
- `query`: `Object` - The query string parsed to an object. Defaults to `{}`
- `asPath`: `String` - Actual path (including the query) shown in the browser

Additionally, useful methods from the `Router API` are also included:

- `push(url, as=url)` - Performs a `pushState` call with the given url
- `replace(url, as=url)` - Performs a `replaceState` call with the given url
- `beforePopState(cb=function)` - intercepts _popstate_ before the router processes the event

The second `as` parameter for `push` and `replace` is an optional decoration of the URL. Useful for dynamic routes.

> The `query` object will be empty during prerendering if the page is [statically optimized](https://www.notion.so/zeithq/Automatic-Static-Optimization-172e00fb49b548f9ab196a5bf754ca2d).
