# Compression

Next.js provides [**gzip**](https://tools.ietf.org/html/rfc6713#section-3) compression to compress rendered content and static files. Compression only works with the [`server` target](/docs/api-reference/next.config.js/build-target.md#server-target). In general you will want to enable compression on a HTTP proxy like [nginx](https://www.nginx.com/), to offload load from the `Node.js` process.

To disable **compression**, open `next.config.js` and disable the `compress` config:

```js
module.exports = {
  compress: false,
}
```
