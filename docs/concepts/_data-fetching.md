# Data Fetching

As outlined in the `pages` documentation Next.js has 2 render modes:

- Static Generation
- Server-Side Rendering

Next.js provides methods to do data fetching for both modes. These methods are agnostic to your data solution.
Meaning you can use any data solution, from fetching rest APIs to GraphQL.

Both of modes have different trade-offs and use different methods of data fetching.

## Static Generation

[Read more about how Static Generation works]().

By default Next.js renders pages to static HTML at build time.

However sometimes you might want to fetch some data from an external source while preserving the static generation behavior.

Next.js provides the `getStaticProps` method to do exactly that, fetch data and render to static HTML.

```jsx
import fetch from 'isomorphic-unfetch'

// Called at build time and renders the page to static HTML.
export async function getStaticProps() {
  const res = await fetch('https://api.github.com/repos/zeit/next.js')
  const json = await res.json()

  return {
    props: {
      stars: json.stargazers_count,
    },
  }
}

function HomePage({ stars }) {
  return <div>Next stars: {stars}</div>
}

export default HomePage
```

## Server-Side Rendering

[Read more about how Server-Side Rendering works]().

To opt-in to Server-Side Rendering, making every request render HTML on-demand you use the `getServerProps` method.

It allows you to fetch data before rendering starts when a request comes in.

Taking the same example as Static Generation, but opted into rendering the page when a request comes in.

```jsx
import fetch from 'isomorphic-unfetch'

// Called when a request comes in.
export async function getServerProps() {
  const res = await fetch('https://api.github.com/repos/zeit/next.js')
  const json = await res.json()

  return {
    props: {
      stars: json.stargazers_count,
    },
  }
}

function HomePage({ stars }) {
  return <div>Next stars: {stars}</div>
}

export default HomePage
```
