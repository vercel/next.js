---
description: Fetch data at build time with `getStaticProps` (Static Generation) API reference.
---

# `getStaticProps`

If you export an `async` function called `getStaticProps` (static generation) from a page, Next.js will pre-render this page at build time using the props returned by `getStaticProps`.

```jsx
export async function getStaticProps(context) {
  return {
    props: {}, // will be passed to the page component as props
  }
}
```

## When should I use `getStaticProps`?

You should use `getStaticProps` if:

- The data required to render the page is available at build time ahead of a user’s request.
- The data comes from a headless CMS.
- The data can be publicly cached (not user-specific).
- The page must be pre-rendered (for SEO) and be very fast — `getStaticProps` generates HTML and JSON files, both of which can be cached by a CDN for performance.

## Using `getStaticProps` to fetch data from a CMS

The following example shows how you can fetch a list of blog posts from a CMS.

```jsx
// posts will be populated at build time by getStaticProps()
function Blog({ posts }) {
  return (
    <ul>
      {posts.map((post) => (
        <li>{post.title}</li>
      ))}
    </ul>
  )
}

// This function gets called at build time on server-side.
// It won't be called on client-side, so you can even do
// direct database queries. See the "Technical details" section.
export async function getStaticProps() {
  // Call an external API endpoint to get posts.
  // You can use any data fetching library
  const res = await fetch('https://.../posts')
  const posts = await res.json()

  // By returning { props: { posts } }, the Blog component
  // will receive `posts` as a prop at build time
  return {
    props: {
      posts,
    },
  }
}

export default Blog
```

The [`getStaticProps` API reference](/docs/api-reference/data-fetching/getStaticProps.md) covers all parameters and props that can be used with `getStaticProps`.

## Technical details

### Only runs at build time

Because `getStaticProps` runs at build time, it does **not** receive data that’s only available during request time, such as query parameters or HTTP headers as it generates static HTML.

### Write server-side code directly

Note that `getStaticProps` runs only on the server-side. It will never be run on the client-side. It won’t even be included in the JS bundle for the browser. That means you can write code such as direct database queries without them being sent to browsers.

You should not fetch an **API route** from `getStaticProps` — instead, you can write the server-side code directly in `getStaticProps`.

You can use the [next-code-elimination tool](https://next-code-elimination.vercel.app/) to verify what Next.js eliminates from the client-side bundle.

### Statically Generates both `HTML` and `JSON`

When a page with `getStaticProps` is pre-rendered at build time, in addition to the page HTML file, Next.js generates a `JSON` file holding the result of running `getStaticProps`.

This `JSON` file will be used in client-side routing through [`next/link`](/docs/api-reference/next/link.md) or [`next/router`](/docs/api-reference/next/router.md). When you navigate to a page that’s pre-rendered using `getStaticProps`, Next.js fetches this `JSON` file (pre-computed at build time) and uses it as the props for the page component. This means that client-side page transitions will **not** call `getStaticProps` as only the exported `JSON` is used.

When using Incremental Static Generation `getStaticProps` will be executed out of band to generate the `JSON` needed for client-side navigation. You may see this in the form of multiple requests being made for the same page, however, this is intended and has no impact on end-user performance

### Only allowed in a page

`getStaticProps` can only be exported from a **page**. You **cannot** export it from non-page files.

One of the reasons for this restriction is that React needs to have all the required data before the page is rendered.

Also, you must use `export async function getStaticProps() {}` — it will **not** work if you add `getStaticProps` as a property of the page component.

### Runs on every request in development

In development (`next dev`), `getStaticProps` will be called on every request.

### Preview Mode

In some cases, you might want to temporarily bypass Static Generation and render the page at **request time** instead of build time. For example, you might be using a headless CMS and want to preview drafts before they're published.

This use case is supported in Next.js by the [**Preview Mode**](/docs/advanced-features/preview-mode.md) feature.
