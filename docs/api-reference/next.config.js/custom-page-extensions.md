---
description: Extend the default page extensions used by Next.js when resolving pages in the pages directory.
---

# Custom Page Extensions

Aimed at modules like [@next/mdx](https://github.com/zeit/next.js/tree/canary/packages/next-mdx), which adds support for pages ending with `.mdx`. You can configure the extensions looked for in the `pages` directory when resolving pages.

Open `next.config.js` and add the `pageExtensions` config:

```js
module.exports = {
  pageExtensions: ['mdx', 'jsx', 'js', 'ts', 'tsx'],
}
```
