---
description: Fetch data at build time with `getStaticProps` API reference.
---

# `getStaticPaths`

If a page has [dynamic routes](/docs/routing/dynamic-routes.md) and uses `getStaticProps`, it needs to define a list of paths that have to be rendered to `HTML` at build time.

When you export an `async` function called `getStaticPaths` (static generation) from a page that uses dynamic routes, Next.js will statically pre-render all the paths specified by `getStaticPaths`.

```jsx
export async function getStaticPaths() {
  return {
    paths: [
      { params: { ... } }
    ],
    fallback: true // false or blocking
  };
}
```

The [`getStaticPaths` API reference](/docs/api-reference/data-fetching/getStaticPaths.md) covers all parameters and props that can be used with `getStaticPaths`.

## When should I use `getStaticPaths`?

You should use `getStaticPaths` if you’re statically pre-rendering pages that use dynamic routes.

## Technical details

### Use together with [`getStaticProps`](/docs/basic-features/data-fetching/getStaticProps.md)

When you use `getStaticProps` on a page with dynamic route parameters, you **must** use `getStaticPaths`.

Note that you **cannot** use `getStaticPaths` with [`getServerSideProps`](/docs/basic-features/data-fetching/getServerSideProps.md).

### Only runs at build time on server-side

`getStaticPaths` only runs at build time on server-side.

### Only allowed in a page

`getStaticPaths` can only be exported from a **page**. You **cannot** export it from non-page files.

You must use `export async function getStaticPaths() {}` — it will **not** work if you add `getStaticPaths` as a property of the page component.

### Runs on every request in development

In development (`next dev`), `getStaticPaths` will be called on every request.
