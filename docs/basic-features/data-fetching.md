---
description: Next.js can handle data fetching in multiple ways for server-rendered and static pages. Learn how it works here.
---

# Data fetching

Next.js has 2 pre-rendering modes built-in:

- [Static Generation](#static-generation)
- [Server-side rendering](#server-side-rendering)

You can learn more about the differences in the [pages section](/docs/basic-features/pages.md#pre-rendering).

These rendering modes are tightly coupled to the way that you do data fetching.

In Next.js data fetching generally happens at the page level. There are multiple reasons for this:

- Avoid data fetching waterfalls, having to render then wait then render etc.
- When pre-rendering React needs to have all data available before rendering.

## Static Generation

By default Next.js pages that don't use [`getInitialProps`](/docs/api-reference/data-fetching/getInitialProps.md) get rendered to static HTML at `next build` time.

This is useful for, as an example, dashboards that have a lot of dynamic data that depends on a specific user.

You might not want to server-render that content but instead load the data client-side.

For this particular use case [ZEIT](https://zeit.co) has created a data-fetching library called [SWR](https://github.com/zeit/swr).

```jsx
// This page doesn't define `getInitialProps`.
// Next.js will export the page to HTML at build time with the loading state
// When the page is loaded in the browser SWR will fetch the data
// Using the defined fetcher function
import fetch from 'unfetch'
import useSWR from 'swr'

const API_URL = 'https://api.github.com'
async function fetcher(path) {
  const res = await fetch(API_URL + path)
  const json = await res.json()
  return json
}

function HomePage() {
  const { data, error } = useSWR('/repos/zeit/next.js', fetcher)

  if (error) return <div>failed to load</div>
  if (!data) return <div>loading...</div>
  return <div>Next stars: {data.stargazers_count}</div>
}

export default HomePage
```

## Server-side rendering

Pages might have to wait on some data before pre-rendering, for example, if you want the page to be indexed with the data by search engines.

Next.js comes with [`getInitialProps`](/docs/api-reference/data-fetching/getInitialProps.md), which is an [`async`](https://zeit.co/blog/async-and-await) function that can be added to any page as a [`static method`](https://javascript.info/static-properties-methods).

`getInitialProps` allows the page to wait for data before rendering starts.

Using `getInitialProps` will make the page opt-in to on-demand [server-side rendering](/docs/basic-features/pages.md#server-side-rendering).

```jsx
// This page has defined `getInitialProps` to do data fetching.
// Next.js will execute `getInitialProps`
// It will wait for the result of `getInitialProps`
// When the results comes back Next.js will render the page.
// Next.js wil do this for every request that comes in.
import fetch from 'isomorphic-unfetch'

function HomePage({ stars }) {
  return <div>Next stars: {stars}</div>
}

HomePage.getInitialProps = async () => {
  const res = await fetch('https://api.github.com/repos/zeit/next.js')
  const json = await res.json()
  return { stars: json.stargazers_count }
}

export default HomePage
```

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/api-reference/data-fetching/getInitialProps.md">
    <b>getInitialProps:</b>
    <small>Learn more about the API for `getInitialProps`.</small>
  </a>
</div>
