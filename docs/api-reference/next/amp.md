---
description: Enable AMP in a page, and control the way Next.js adds AMP to the page with the AMP config.
---

# next/amp

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/amp">AMP</a></li>
  </ul>
</details>

> AMP support is one of our advanced features, you can [read more about AMP here](/docs/advanced-features/amp-support/introduction.md).

To enable AMP, add the following config to your page:

```jsx
export const config = { amp: true }
```

The `amp` config accepts the following values:

- `true` - The page will be AMP-only
- `'hybrid'` - The page will have two versions, one with AMP and another one with HTML

To learn more about the `amp` config, read the sections below.

## AMP First Page

Take a look at the following example:

```jsx
export const config = { amp: true }

function About(props) {
  return <h3>My AMP About Page!</h3>
}

export default About
```

The page above is an AMP-only page, which means:

- The page has no Next.js or React client-side runtime
- The page is automatically optimized with [AMP Optimizer](https://github.com/ampproject/amp-toolbox/tree/master/packages/optimizer), an optimizer that applies the same transformations as AMP caches (improves performance by up to 42%)
- The page has a user-accessible (optimized) version of the page and a search-engine indexable (unoptimized) version of the page

## Hybrid AMP Page

Take a look at the following example:

```jsx
import { useAmp } from 'next/amp'

export const config = { amp: 'hybrid' }

function About(props) {
  const isAmp = useAmp()

  return (
    <div>
      <h3>My AMP About Page!</h3>
      {isAmp ? (
        <amp-img
          width="300"
          height="300"
          src="/my-img.jpg"
          alt="a cool image"
          layout="responsive"
        />
      ) : (
        <img width="300" height="300" src="/my-img.jpg" alt="a cool image" />
      )}
    </div>
  )
}

export default About
```

The page above is a hybrid AMP page, which means:

- The page is rendered as traditional HTML (default) and AMP HTML (by adding `?amp=1` to the URL)
- The AMP version of the page only has valid optimizations applied with AMP Optimizer so that it is indexable by search-engines

The page uses `useAmp` to differentiate between modes, it's a [React Hook](https://reactjs.org/docs/hooks-intro.html) that returns `true` if the page is using AMP, and `false` otherwise.
