---
description: Extend the default page extensions used by Next.js when resolving pages in the pages directory.
---

# Custom Page Extensions

Aimed at modules like [@next/mdx](https://github.com/vercel/next.js/tree/canary/packages/next-mdx), which adds support for pages ending with `.mdx`. You can configure the extensions looked for in the `pages` directory when resolving pages.

Open `next.config.js` and add the `pageExtensions` config:

```js
module.exports = {
  pageExtensions: ['mdx', 'md', 'jsx', 'js', 'tsx', 'ts'],
}
```

> **Note**: The default value of `pageExtensions` is [`['tsx', 'ts', 'jsx', 'js']`](https://github.com/vercel/next.js/blob/f1dbc9260d48c7995f6c52f8fbcc65f08e627992/packages/next/server/config-shared.ts#L161).

> **Note**: configuring `pageExtensions` also affects `_document.js`, `_app.js`, `middleware.js` as well as files under `pages/api/`. For example, setting `pageExtensions: ['page.tsx', 'page.ts']` means the following files: `_document.tsx`, `_app.tsx`, `middleware.ts`, `pages/users.tsx` and `pages/api/users.ts` will have to be renamed to `_document.page.tsx`, `_app.page.tsx`, `middleware.page.ts`, `pages/users.page.tsx` and `pages/api/users.page.ts` respectively.

## Including non-page files in the `pages` directory

To colocate test files, generated files, or other files used by components in the `pages` directory, you can prefix the extensions with something like `page`.

Open `next.config.js` and add the `pageExtensions` config:

```js
module.exports = {
  pageExtensions: ['page.tsx', 'page.ts', 'page.jsx', 'page.js'],
}
```

Then rename your pages to have a file extension that includes `.page` (ex. rename `MyPage.tsx` to `MyPage.page.tsx`).

> **Note**: Make sure you also rename `_document.js`, `_app.js`, `middleware.js`, as well as files under `pages/api/`.

Without this config, Next.js assumes every tsx/ts/jsx/js file in the `pages` directory is a page or API route, and may expose unintended routes vulnerable to denial of service attacks, or throw an error like the following when building the production bundle:

```
Build error occurred
Error: Build optimization failed: found pages without a React Component as default export in
pages/MyPage.generated
pages/MyPage.test

See https://nextjs.org/docs/messages/page-without-valid-component for more info.
```

## Related

<div class="card">
  <a href="/docs/api-reference/next.config.js/introduction.md">
    <b>Introduction to next.config.js:</b>
    <small>Learn more about the configuration file used by Next.js.</small>
  </a>
</div>
