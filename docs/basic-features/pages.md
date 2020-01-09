---
description: Next.js pages are React Components exported in a file in the pages directory. Learn how they work here.
---

# Pages

A page is a [React Component](https://reactjs.org/docs/components-and-props.html) exported from a `.js`, `.ts`, or `.tsx` file in the `pages` directory.

Pages are associated with a route based on their file name. For example `pages/about.js` is mapped to `/about`. You can even utilize dynamic route parameters through the filename.

For example `pages/index.js` could be a React component returning some [JSX](https://reactjs.org/docs/introducing-jsx.html) content:

```jsx
function HomePage() {
  return <div>Welcome to Next.js!</div>
}

export default HomePage
```

## Pre-rendering

Next.js comes with the concept of pre-rendering built-in. This is enabled by default. Pre-rendering comes in 2 forms:

- Static Generation
- Server-side rendering

Next.js applications can be a hybrid combination of these rendering targets. You decide per-page if it will be statically rendered at build time or if will be server-rendered on-demand.

The way that Pre-rendering works in Next.js is that the page is rendered to HTML either at build-time or on-demand, this generated HTML will be optimized automatically.

The generated HTML will include the JavaScript needed to load React with the current page's React component. When that is loaded we use a process called "hydration" to make sure the React event handlers and effects are attached and called.

## Static Generation

Generally used for:

- Static Marketing pages
- Static Blog
- Dashboards

Referred to as:

- Static Site Generation (SSG)
- Static Generation
- Static Websites

The page is rendered to static HTML when `next build` is ran. `next build` will output the HTML into a `.html` file and that file will be served consistently without changes.

Considering that by default pages in Next.js have consistent output between renders, Next.js will pre-render the pages that don't have blocking data requirements.

One upside of build-time pre-rendering is that static HTML can be served from a CDN automatically if your hosting provider supports it.

```jsx
// This page has no blocking data requirements
// it'll be rendered as static HTML at build time
function HomePage() {
  return <div>Welcome to Next.js!</div>
}

export default HomePage
```

## Server-Side Rendering

Generally used for:

- Frequently updated data
- CMS backed pages

Referred to as:

- Server-Side rendering (SSR)
- Dynamic rendering
- On-demand rendering

When a request comes in to the server the page is rendered on-demand, meaning the user that requests the page always gets the latest data. This mode is opted into by adding a blocking data requirement to the page.

Data is always up-to-date but it comes at the cost of a slightly higher [Time to First Byte](https://web.dev/time-to-first-byte/) as HTML has to be rendered for the specific user. Additionally a Node.js runtime has to be running and has to scale with the amount of traffic.

```jsx
// This page has defined `getInitialProps` to do data fetching.
// Next.js will execute `getInitialProps`
// It will wait for the result of `getInitialProps`
// When the results comes back Next.js will render the page.
// Next.js will do this for every request that comes in.
import fetch from 'isomorphic-unfetch'

function HomePage({ stars }) {
  return <div>Next stars: {stars}</div>
}

HomePage.getInitialProps = async ({ req }) => {
  const res = await fetch('https://api.github.com/repos/zeit/next.js')
  const json = await res.json()
  return { stars: json.stargazers_count }
}

export default HomePage
```

## Learn more

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/routing/introduction.md">
    <b>Routing:</b>
    <small>Learn more about routing in Next.js</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/typescript.md#pages">
    <b>TypeScript:</b>
    <small>Add TypeScript to your pages</small>
  </a>
</div>
