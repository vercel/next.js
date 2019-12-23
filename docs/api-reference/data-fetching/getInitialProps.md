# getInitialProps

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/data-fetch">Data fetch</a></li>
  </ul>
</details>

`getInitialProps` enables [server-side rendering](/docs/basic-features/pages.md#server-side-rendering) in a page and allows you to do **initial data population**, it means sending the [page](/docs/basic-features/pages.md) with the data already populated from the server. This is especially useful for [SEO](https://en.wikipedia.org/wiki/Search_engine_optimization).

> `getInitialProps` will disable [Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md).

`getInitialProps` is an [`async`](https://zeit.co/blog/async-and-await) function that can be added to any page as a [`static method`](https://javascript.info/static-properties-methods). Take a look at the following example:

```jsx
import fetch from 'isomorphic-unfetch'

function Page({ stars }) {
  return <div>Next stars: {stars}</div>
}

Page.getInitialProps = async ctx => {
  const res = await fetch('https://api.github.com/repos/zeit/next.js')
  const json = await res.json()
  return { stars: json.stargazers_count }
}

export default Page
```

Or using a class component:

```jsx
import React from 'react'

class Page extends React.Component {
  static async getInitialProps(ctx) {
    const res = await fetch('https://api.github.com/repos/zeit/next.js')
    const json = await res.json()
    return { stars: json.stargazers_count }
  }

  render() {
    return <div>Next stars: {stars}</div>
  }
}

export default Page
```

`getInitialProps` is used to asynchronously fetch some data, which then populates `props`.

Data returned from `getInitialProps` is serialized when server rendering, similar to what [`JSON.stringify`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) does. Make sure the returned object from `getInitialProps` is a plain `Object` and not using `Date`, `Map` or `Set`.

For the initial page load, `getInitialProps` will execute on the server only. `getInitialProps` will only be executed on the client when navigating to a different route via the [`next/link`](/docs/api-reference/next/link.md) component or by using [`next/router`](/docs/api-reference/next/router.md).

## Context Object

`getInitialProps` receives a single argument called `context`, it's an object with the following properties:

- `pathname` - path section of URL
- `query` - query string section of URL parsed as an object
- `asPath` - `String` of the actual path (including the query) shown in the browser
- `req` - HTTP request object (server only)
- `res` - HTTP response object (server only)
- `err` - Error object if any error is encountered during the rendering

## Caveats

- `getInitialProps` can **not** be used in children components, only in the default export of every page
- If you are using server-side only modules inside `getinitialProps`, make sure to [import them properly](https://arunoda.me/blog/ssr-and-server-only-modules), otherwise it'll slow down your app

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/basic-features/pages.md">
    <b>Pages:</b>
    <small>Learn more about what pages are in Next.js.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/data-fetching.md">
    <b>Data Fetching:</b>
    <small>Learn more about data fetching in Next.js.</small>
  </a>
</div>
