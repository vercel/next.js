---
description: Extend the default page extensions used by Next.js when resolving pages in the pages directory.
---

# Custom Page Extensions

Aimed at modules like [@next/mdx](https://github.com/vercel/next.js/tree/canary/packages/next-mdx), which adds support for pages ending with `.mdx`. You can configure the extensions looked for in the `pages` directory when resolving pages.

Open `next.config.js` and add the `pageExtensions` config:

```js
module.exports = {
  pageExtensions: ['mdx', 'jsx', 'js', 'ts', 'tsx'],
}
```

> **Note**: configuring `pageExtensions` also affects `_document.js`, `_app.js` as well as files under `pages/api/`. For example, setting `pageExtensions: ['page.tsx', 'page.ts']` means the following files: `_document.tsx`, `_app.tsx`, `pages/users.tsx` and `pages/api/users.ts` will have to be renamed to `_document.page.tsx`, `_app.page.tsx`, `pages/users.page.tsx` and `pages/api/users.page.ts` respectively.

## Related

<div class="card">
  <a href="/docs/api-reference/next.config.js/introduction.md">
    <b>Introduction to next.config.js:</b>
    <small>Learn more about the configuration file used by Next.js.</small>
  </a>
</div>
