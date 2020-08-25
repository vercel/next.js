---
description: Next.js has the abilility to clear the incremental cache by array of keys. You can learn how it works here.
---

# Clearing the Incremental Cache

> This document is for Next.js versions 9.5 and up.

In the [Pages documentation](/docs/basic-features/pages.md) and the [Data Fetching documentation](/docs/basic-features/data-fetching.md), we talked about how to pre-render a page at build time (**Static Generation**) using `getStaticProps` and `getStaticPaths`.

Static Generation is useful when your pages fetch data from a headless CMS. However, it’s not ideal when you are wanting your changes to reflect instantly. In this scenario, you would call 'clearIncrementalCache' on the next app and pass in an array of strings.

Note: It is recommend you password protect this route and use it as little as possible.

```js
export default (req, res) => {
  // ...
  app.clearIncrementalCache(['/path-1', '/path-2'])
  res.send({ message: 'Cache Cleared' })

  // ...
}
```
