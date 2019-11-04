# Dynamic API Routes

API pages support [dynamic routes](/docs/routing/dynamic-routes.md), and follow the same file naming rules used for `pages`.

For example, the API route `pages/api/post/[pid].js` has the following code:

```js
export default (req, res) => {
  const {
    query: { pid },
  } = req

  res.end(`Post: ${pid}`)
}
```

Now, a request to `/api/post/abc` will respond with the text: `Post: abc`.
