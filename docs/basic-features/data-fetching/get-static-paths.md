---
description: Fetch data and generate static pages with `getStaticProps`. Learn more about this API for data fetching in Next.js.
---

# getStaticPaths

If a page has [Dynamic Routes](/docs/routing/dynamic-routes.md) and uses `getStaticProps`, it needs to define a list of paths to be statically generated.

When you export a function called `getStaticPaths` (Static Site Generation) from a page that uses dynamic routes, Next.js will statically pre-render all the paths specified by `getStaticPaths`.

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

`getStaticPaths` **must** be used with `getStaticProps`. You **cannot** use it with [`getServerSideProps`](/docs/basic-features/data-fetching/get-server-side-props.md).

The [`getStaticPaths` API reference](/docs/api-reference/data-fetching/get-static-paths.md) covers all parameters and props that can be used with `getStaticPaths`.

## When should I use getStaticPaths?

You should use `getStaticPaths` if you’re statically pre-rendering pages that use dynamic routes and:

- The data comes from a headless CMS
- The data comes from a database
- The data comes from the filesystem
- The data can be publicly cached (not user-specific)
- The page must be pre-rendered (for SEO) and be very fast — `getStaticProps` generates `HTML` and `JSON` files, both of which can be cached by a CDN for performance

## When does getStaticPaths run

`getStaticPaths` will only run during build in production, it will not be called during runtime. You can validate code written inside `getStaticPaths` is removed from the client-side bundle [with this tool](https://next-code-elimination.vercel.app/).

### How does getStaticProps run with regards to getStaticPaths

- `getStaticProps` runs during `next build` for any `paths` returned during build
- `getStaticProps` runs in the background when using `fallback: true`
- `getStaticProps` is called before initial render when using `fallback: blocking`

## Where can I use getStaticPaths

`getStaticPaths` can only be exported from a [dynamic route](/docs/routing/dynamic-routes.md) that also uses `getStaticProps`. You **cannot** export it from non-page files e.g. from your `components` folder.

Note that you must use export `getStaticPaths` as a standalone function — it will **not** work if you add `getStaticPaths` as a property of the page component.

## Runs on every request in development

In development (`next dev`), `getStaticPaths` will be called on every request.

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/api-reference/data-fetching/get-static-paths.md">
    <b>getStaticPaths API Reference</b>
    <small>Read the API Reference for getStaticPaths</small>
  </a>
</div>
