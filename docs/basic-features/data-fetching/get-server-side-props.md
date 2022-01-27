---
description: Fetch data on each request with `getServerSideProps`.
---

# getServerSideProps

If you export a function called `getServerSideProps` (Server-Side Rendering) from a page, Next.js will pre-render this page on each request using the data returned by `getServerSideProps`.

```js
export async function getServerSideProps(context) {
  return {
    props: {}, // will be passed to the page component as props
  }
}
```

## When does getServerSideProps run

`getServerSideProps` only runs on server-side and never runs on the browser. If a page uses `getServerSideProps`, then:

- When you request this page directly, `getServerSideProps` runs at request time, and this page will be pre-rendered with the returned props
- When you request this page on client-side page transitions through [`next/link`](/docs/api-reference/next/link.md) or [`next/router`](/docs/api-reference/next/router.md), Next.js sends an API request to the server, which runs `getServerSideProps`.

It then returns `JSON` that contains the result of running `getServerSideProps`, that `JSON` will be used to render the page. All this work will be handled automatically by Next.js, so you don’t need to do anything extra as long as you have `getServerSideProps` defined.

You can use the [next-code-elimination tool](https://next-code-elimination.vercel.app/) to verify what Next.js eliminates from the client-side bundle.

`getServerSideProps` can only be exported from a **page**. You can’t export it from non-page files.

Note that you must export `getServerSideProps` as a standalone function — it will **not** work if you add `getServerSideProps` as a property of the page component.

The [`getServerSideProps` API reference](/docs/api-reference/data-fetching/get-server-side-props.md) covers all parameters and props that can be used with `getServerSideProps`.

## When should I use getServerSideProps

You should use `getServerSideProps` only if you need to pre-render a page whose data must be fetched at request time. [Time to First Byte (TTFB)](https://web.dev/ttfb/) will be higher than [`getStaticProps`](/docs/basic-features/data-fetching/get-static-props.md) because the server must compute the result on every request, and the result can only be cached by a CDN using `cache-control` headers (which could require extra configuration).

If you do not need to pre-render the data, then you should consider fetching data on the [client side](#fetching-data-on-the-client-side).

### getServerSideProps or API Routes

It can be tempting to reach for an [API Route](/docs/api-routes/introduction.md) when you want to fetch data from the server, then call that API route from `getServerSideProps`. This is an unnecessary and inefficient approach, as it will cause an extra request to be made due to both `getServerSideProps` and API Routes running on the server.

Take the following example. An API route is used to fetch some data from a CMS. That API route is then called directly from `getServerSideProps`. This produces an additional call, reducing performance. Instead, directly import the logic used inside your API Route into `getServerSideProps`. This could mean calling a CMS, database, or other API directly from inside `getServerSideProps`.

## Fetching data on the client side

If your page contains frequently updating data, and you don’t need to pre-render the data, you can fetch the data on the [client side](/docs/basic-features/data-fetching/client-side.md). An example of this is user-specific data:

- First, immediately show the page without data. Parts of the page can be pre-rendered using Static Generation. You can show loading states for missing data.
- Then, fetch the data on the client side and display it when ready.

This approach works well for user dashboard pages, for example. Because a dashboard is a private, user-specific page, SEO is not relevant and the page doesn’t need to be pre-rendered. The data is frequently updated, which requires request-time data fetching.

## Using getServerSideProps to fetch data at request time

The following example shows how to fetch data at request time and pre-render the result.

```jsx
function Page({ data }) {
  // Render data...
}

// This gets called on every request
export async function getServerSideProps() {
  // Fetch data from external API
  const res = await fetch(`https://.../data`)
  const data = await res.json()

  // Pass data to the page via props
  return { props: { data } }
}

export default Page
```

<div class="card">
  <a href="/docs/api-reference/data-fetching/get-server-side-props.md">
    <b>getServerSideProps API Reference</b>
    <small>Read the API Reference for getServerSideProps</small>
  </a>
</div>
