---
description: Fetch data and generate static pages with `getStaticProps`. Learn more about this API for data fetching in Next.js.
---

# `getStaticPaths`

If a page has [Dynamic Routes](/docs/routing/dynamic-routes.md) and uses `getStaticProps`, it needs to define a list of paths to be statically generated.

When you export an `async` function called `getStaticPaths` (static generation) from a page that uses dynamic routes, Next.js will statically pre-render all the paths specified by `getStaticPaths`.

```jsx
export async function getStaticPaths() {
  return {
    paths: [
      { params: { ... } }
    ],
    fallback: true // false or 'blocking'
  };
}
```

The [`getStaticPaths` API reference](/docs/api-reference/data-fetching/getStaticPaths.md) covers all parameters and props that can be used with `getStaticPaths`.

## When should I use `getStaticPaths`?

You should use `getStaticPaths` if you’re statically pre-rendering pages that use dynamic routes and:

- The data comes from a headless CMS
- The data comes from a database
- The data comes from the filesystem
- The data can be publicly cached (not user-specific)
- The page must be pre-rendered (for SEO) and be very fast — `getStaticProps` generates `HTML` and `JSON` files, both of which can be cached by a CDN for performance

## TypeScript: Use `GetStaticPaths`

For TypeScript, you can use the `GetStaticPaths` type from `next`:

```ts
import { GetStaticPaths } from 'next'

export const getStaticPaths: GetStaticPaths = async () => {
  // ...
}
```

## Technical details

### Use together with [`getStaticProps`](/docs/basic-features/data-fetching/getStaticProps.md)

When you use `getStaticProps` on a page with dynamic route parameters, you **must** use `getStaticPaths`.

Note that you **cannot** use `getStaticPaths` with [`getServerSideProps`](/docs/basic-features/data-fetching/getServerSideProps.md).

### Only runs at build time on server-side

`getStaticPaths` only runs at build time on server-side. If you're using [Incremental Static Regeneration](/docs/basic-features/data-fetching/incremental-static-regeneration.md), `getStaticPaths` can also be ran on-demand _in the background_, but still only on the server-side..

### Only allowed in a page

`getStaticPaths` can only be exported from a **page**. You **cannot** export it from non-page files.

You must use export `getStaticPaths` as a standalone function — it will **not** work if you add `getStaticPaths` as a property of the page component.

### Runs on every request in development

In development (`next dev`), `getStaticPaths` will be called on every request.
