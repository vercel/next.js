---
description: Get to know more about Next.js with the frequently asked questions.
---

# Frequently Asked Questions

<details>
  <summary>Is this production ready?</summary>
  <p>Next.js has been powering <a href="https://vercel.com">https://vercel.com</a>  since its inception.</p>

  <p>We’re ecstatic about both the developer experience and end-user performance, so we decided to share it with the community.</p>
</details>

<details>
  <summary>How big is it?</summary>
  <p>The client side bundle size should be measured in a per-app basis. A small Next main bundle is around 65kb gzipped.</p>
</details>

<details>
  <summary>How can I change the internal webpack configs?</summary>
  <p>Next.js tries its best to remove the overhead of webpack configurations, but for advanced cases where more control is needed, refer to the <a href="/docs/api-reference/next.config.js/custom-webpack-config.md">custom webpack config documentation</a>.</p>
</details>

<details>
  <summary>What syntactic features are compiled? How do I change them?</summary>
  <p>We track V8. Since V8 has wide support for ES6 and async and await, we compile those. Since V8 doesn’t support class decorators, we don’t compile those.</p>

  <p>See the documentation about <a href="/docs/advanced-features/customizing-babel-config.md">customizing babel config</a> for more information.</p>
</details>

<details>
  <summary>Why a new Router?</summary>
  Next.js is special in that:
  <ul>
    <li>Routes don’t need to be known ahead of time, We don't ship a route manifest</li>
    <li>Routes are always lazy-loadable</li>
  </ul>
</details>

<details>
  <summary>How do I fetch data?</summary>
  <p>It's up to you. You can use the <a href="https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch">fetch API</a> or <a href="https://swr.now.sh/">SWR</a> inside your React components for remote data fetching; or use our <a href="/docs/basic-features/data-fetching.md">data fetching methods</a> for initial data population.</p>
</details>

<details>
  <summary>Can I use it with GraphQL?</summary>
  <p>Yes! Here's an <a href="https://github.com/vercel/next.js/tree/canary/examples/with-apollo">example with Apollo</a>.</p>
</details>

<details>
  <summary>Can I use it with Redux?</summary>
  <p>Yes! Here's an <a href="https://github.com/vercel/next.js/tree/canary/examples/with-redux">example</a>. And there's another <a href="https://github.com/vercel/next.js/tree/canary/examples/with-redux-thunk">example with thunk</a>.</p>
</details>

<details>
  <summary>Can I use a CDN for static assets?</summary>
  <p>Yes. You can read more about it <a href="/docs/api-reference/next.config.js/cdn-support-with-asset-prefix.md">here</a>.</p>
</details>

<details>
  <summary>Can I use Next with my favorite JavaScript library or toolkit?</summary>
  <p>Since our first release we've had many example contributions. You can check them out in the <a href="https://github.com/vercel/next.js/tree/canary/examples">examples</a> directory.</p>
</details>

<details>
  <summary>What is this inspired by?</summary>
  <p>Many of the goals we set out to accomplish were the ones listed in The <a href="https://rauchg.com/2014/7-principles-of-rich-web-applications">7 principles of Rich Web Applications</a> by Guillermo Rauch.</p>

  <p>The ease-of-use of PHP is a great inspiration. We feel Next.js is a suitable replacement for many scenarios where you would otherwise use PHP to output HTML.</p>

  <p>Unlike PHP, we benefit from the ES6 module system and every page exports a component or function that can be easily imported for lazy evaluation or testing.</p>

  <p>As we were researching options for server-rendering React that didn’t involve a large number of steps, we came across <a href="https://github.com/facebookarchive/react-page">react-page</a> (now deprecated), a similar approach to Next.js by the creator of React Jordan Walke.</p>
</details>

<details>
  <summary>Can I make a Next.js Progressive Web App (PWA)?</summary>
   <p>Yes! Check out our <a href="https://github.com/vercel/next.js/tree/canary/examples/progressive-web-app">PWA Example</a> to see how it works.</p>
</details>
