# Dynamic API Routes

API pages support [dynamic routes](https://www.notion.so/zeithq/Dynamic-Routes-6b992822e021418c9125ad60cffe3b62), and follow the same file naming rules used for `pages`.

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
