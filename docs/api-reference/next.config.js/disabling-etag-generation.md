---
description: Next.js will generate etags for every page by default. Learn more about how to disable etag generation here.
---

# Disabling ETag Generation

Next.js will generate [etags](https://en.wikipedia.org/wiki/HTTP_ETag) for every page by default. You may want to disable etag generation for HTML pages depending on your cache strategy.

Open `next.config.js` and disable the `generateEtags` option:

```js
module.exports = {
  generateEtags: false,
}
```
