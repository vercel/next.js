---
description: Fetch data at build time with `getStaticProps` API reference.
---

<<<<<<< HEAD

# `getStaticPaths`

If a page has [dynamic routes](/docs/routing/dynamic-routes.md) and uses `getStaticProps`, it needs to define a list of paths that have to be rendered to `HTML` at build time.

# When you export an `async` function called `getStaticPaths` (static generation) from a page that uses dynamic routes, Next.js will statically pre-render all the paths specified by `getStaticPaths`.

# `getStaticPaths` (Static Generation)

If a page has [dynamic routes](/docs/routing/dynamic-routes.md) and uses `getStaticProps`, it needs to define a list of paths that have to be rendered to `HTML` at build time.

When you export an `async` function called `getStaticPaths` from a page that uses dynamic routes, Next.js will statically pre-render all the paths specified by `getStaticPaths`.

> > > > > > > 1d3d662c4 (merge conflicts)

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

<<<<<<< HEAD
The [`getStaticPaths` API reference](/docs/api-reference/data-fetching/getStaticPaths.md) covers all parameters and props that can be used with `getStaticPaths`.
=======
The [`getStaticPaths` API reference](/docs/api-reference/getstaticpaths.md) covers all parameters and props that can be used with `getStaticPaths`.

> > > > > > > 1d3d662c4 (merge conflicts)

## When should I use `getStaticPaths`?

You should use `getStaticPaths` if you’re statically pre-rendering pages that use dynamic routes.

<<<<<<< HEAD

## TypeScript: Use `GetStaticPaths`

For TypeScript, you can use the `GetStaticPaths` type from `next`:

```ts
import { GetStaticPaths } from 'next'

export const getStaticPaths: GetStaticPaths = async () => {
  // ...
}
```

=======

> > > > > > > 1d3d662c4 (merge conflicts)

## Technical details

### Use together with [`getStaticProps`](/docs/basic-features/data-fetching/getStaticProps.md)

When you use `getStaticProps` on a page with dynamic route parameters, you **must** use `getStaticPaths`.

<<<<<<< HEAD
Note that you **cannot** use `getStaticPaths` with [`getServerSideProps`](/docs/basic-features/data-fetching/getServerSideProps.md).
=======
Note that you **cannot** use `getStaticPaths` with [`getServerSideProps`](/docs/data-fetching/getServerSideProps.md).

> > > > > > > 1d3d662c4 (merge conflicts)

### Only runs at build time on server-side

`getStaticPaths` only runs at build time on server-side.

### Only allowed in a page

`getStaticPaths` can only be exported from a **page**. You **cannot** export it from non-page files.

You must use `export async function getStaticPaths() {}` — it will **not** work if you add `getStaticPaths` as a property of the page component.

### Runs on every request in development

In development (`next dev`), `getStaticPaths` will be called on every request.
