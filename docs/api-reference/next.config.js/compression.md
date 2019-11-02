# Compression

Next.js provides [**gzip**](https://tools.ietf.org/html/rfc6713#section-3) compression to compress rendered content and static files. Compression only works with the [`server` target](https://www.notion.so/zeithq/Build-target-4db30a2386aa4c7f9777fee68fd59c1b#4269b59cf0b3428c84b4d9bc9e337e2a). In general you will want to enable compression on a HTTP proxy like [nginx](https://www.nginx.com/), to offload load from the `Node.js` process.

To disable **compression**, open `next.config.js` and disable the `compress` config:

```js
module.exports = {
  compress: false,
}
```
