---
description: Get to know more about Next.js with the frequently asked questions.
---

# Frequently Asked Questions

<details>
  <summary>Is Next.js production ready?</summary>
  <p>Yes! Next.js is used by many of the top websites in the world. See the
  <a href="https://nextjs.org/showcase">Showcase</a> for more info.</p>
</details>

<details>
  <summary>How do I fetch data in Next.js?</summary>
  Next.js provides a variety of methods depending on your use case. You can use:
  <ul>
    <li> Client-side data fetching: Fetch data with <a href="/docs/basic-features/data-fetching/client-side.md#client-side-data-fetching-with-useeffect">useEffect</a> or <a href="/docs/basic-features/data-fetching/client-side.md#client-side-data-fetching-with-swr">SWR</a> inside your React components</li>
    <li> Server-side rendering with <a href="/docs/basic-features/data-fetching/get-server-side-props.md">getServerSideProps</a></li>
    <li> Static-site generation with <a href="/docs/basic-features/data-fetching/get-static-props.md">getStaticProps</a></li>
    <li> Incremental Static Regeneration by <a href="/docs/basic-features/data-fetching/incremental-static-regeneration.md">adding the `revalidate` prop to getStaticProps</a></li>
  </ul>
  To learn more about data fetching, visit our <a href="/docs/basic-features/data-fetching/overview.md">data fetching documentation</a>.
</details>

<details>
  <summary>Why does Next.js have its own Router?</summary>
  Next.js includes a built-in router for a few reasons:
  <ul>
    <li>It uses a file-system based router which reduces configuration</li>
    <li>It supports shallow routing which allows you to change the URL without running data fetching methods</li>
    <li>Routes are always lazy-loadable</li>
  </ul>
    If you're migrating from React Router, see the <a href="/docs/migrating/from-react-router.md">migration documentation</a>.
</details>

<details>
  <summary>Can I use Next.js with my favorite JavaScript library?</summary>
  <p>Yes! We have hundreds of examples in our <a href="https://github.com/vercel/next.js/tree/canary/examples">examples directory</a>.</p>
</details>

<details>
  <summary>Can I use Next.js with GraphQL?</summary>
  <p>Yes! Here's an <a href="https://github.com/vercel/next.js/tree/canary/examples/with-apollo">example with Apollo</a> and an <a href="https://github.com/vercel/next.js/tree/canary/examples/api-routes-graphql">example API Route with GraphQL</a>.</p>
</details>

<details>
  <summary>Can I use Next.js with Redux?</summary>
  <p>Yes! Here's an <a href="https://github.com/vercel/next.js/tree/canary/examples/with-redux">example with Redux</a> and an <a href="https://github.com/vercel/next.js/tree/canary/examples/with-redux-thunk">example with thunk</a>.</p>
</details>

<details>
  <summary>Can I make a Next.js Progressive Web App (PWA)?</summary>
   <p>Yes! Here's our <a href="https://github.com/vercel/next.js/tree/canary/examples/progressive-web-app">Next.js PWA Example</a>.</p>
</details>

<details>
  <summary>Can I use a CDN for static assets?</summary>
  <p>Yes! When you deploy your Next.js application to <a href="https://vercel.com">Vercel</a>, your static assets are automatically detected and served by the Edge Network. If you self-host Next.js, you can learn how to manually configure the asset prefix <a href="/docs/api-reference/next.config.js/cdn-support-with-asset-prefix.md">here</a>.</p>
</details>

<details>
  <summary>How can I change the internal webpack config?</summary>
  <p>In most cases, no manual webpack configuration is necessary since Next.js automatically configures webpack. For advanced cases where more control is needed, refer to the <a href="/docs/api-reference/next.config.js/custom-webpack-config.md">custom webpack config documentation</a>.</p>
</details>

<details>
  <summary>What is Next.js inspired by?</summary>
  <p>Many of the goals we set out to accomplish were the ones listed in The <a href="https://rauchg.com/2014/7-principles-of-rich-web-applications">7 principles of Rich Web Applications</a> by Guillermo Rauch.</p>

  <p>The ease-of-use of PHP is a great inspiration. We feel Next.js is a suitable replacement for many scenarios where you would otherwise use PHP to output HTML.</p>

  <p>Unlike PHP, we benefit from the ES6 module system and every page exports a component or function that can be easily imported for lazy evaluation or testing.</p>

  <p>As we were researching options for server-rendering React that didn’t involve a large number of steps, we came across <a href="https://github.com/facebookarchive/react-page">react-page</a> (now deprecated), a similar approach to Next.js by the creator of React Jordan Walke.</p>
</details>
