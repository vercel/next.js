# Enabling AMP

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/amp">AMP</a></li>
  </ul>
</details>
<br/>

To enable AMP support for a page, add the following config to your page:

```jsx
export const config = { amp: true }
```

The `amp` config accepts the following values:

- `true` - The page will be AMP-only
- `'hybrid'` - The page will two versions, one with AMP and another one with HTML

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
- The page has an user-accessible (optimized) version of the page and a search-engine indexable (unoptimized) version of the page

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
- The page can differentiate between modes with `useAmp`, which is used in the example above.
