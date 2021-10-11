---
description: Fetch data at build time with `getStaticProps` API reference.
---

# `getServerSideProps` (Server-side Rendering)

If you export an `async` function called `getServerSideProps` from a page, Next.js will pre-render this page on each request using the data returned by `getServerSideProps`.

```js
export async function getServerSideProps(context) {
  return {
    props: {}, // will be passed to the page component as props
  }
}
```

### When should I use `getServerSideProps`?

You should use `getServerSideProps` only if you need to pre-render a page whose data must be fetched at request time. Time to first byte (TTFB) will be slower than [`getStaticProps`](/docs/data-fetching/getstaticprops.md) because the server must compute the result on every request, and the result cannot be cached by a CDN without extra configuration.

If you do not need to pre-render the data, then you should consider fetching data on the [client side](#fetching-data-on-the-client-side).

### TypeScript: Use `GetServerSideProps`

For TypeScript, you can use the `GetServerSideProps` type from `next`:

```ts
import { GetServerSideProps } from 'next'

export const getServerSideProps: GetServerSideProps = async (context) => {
  // ...
}
```

If you want to get inferred typings for your props, you can use `InferGetServerSidePropsType<typeof getServerSideProps>`, like this:

```tsx
import { InferGetServerSidePropsType } from 'next'

type Data = { ... }

export const getServerSideProps = async () => {
  const res = await fetch('https://.../data')
  const data: Data = await res.json()

  return {
    props: {
      data,
    },
  }
}

function Page({ data }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  // will resolve posts to type Data
}

export default Page
```

### Technical details

#### Only runs on server-side

`getServerSideProps` only runs on server-side and never runs on the browser. If a page uses `getServerSideProps`, then:

- When you request this page directly, `getServerSideProps` runs at the request time, and this page will be pre-rendered with the returned props.
- When you request this page on client-side page transitions through `next/link` ([documentation](/docs/api-reference/next/link.md)) or `next/router` ([documentation](/docs/api-reference/next/router.md)), Next.js sends an API request to the server, which runs `getServerSideProps`. It’ll return JSON that contains the result of running `getServerSideProps`, and the JSON will be used to render the page. All this work will be handled automatically by Next.js, so you don’t need to do anything extra as long as you have `getServerSideProps` defined.

You can use [this tool](https://next-code-elimination.vercel.app/) to verify what Next.js eliminates from the client-side bundle.

#### Only allowed in a page

`getServerSideProps` can only be exported from a **page**. You can’t export it from non-page files.

Also, you must use `export async function getServerSideProps() {}` — it will **not** work if you add `getServerSideProps` as a property of the page component.

## Fetching data on the client side

If your page contains frequently updating data, and you don’t need to pre-render the data, you can fetch the data on the client side. An example of this is user-specific data. Here’s how it works:

- First, immediately show the page without data. Parts of the page can be pre-rendered using Static Generation. You can show loading states for missing data.
- Then, fetch the data on the client side and display it when ready.

This approach works well for user dashboard pages, for example. Because a dashboard is a private, user-specific page, SEO is not relevant and the page doesn’t need to be pre-rendered. The data is frequently updated, which requires request-time data fetching.

## Using `getServerSideProps` to fetch data at request time

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
