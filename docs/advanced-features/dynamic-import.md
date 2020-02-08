---
description: Dynamically import JavaScript modules and React Components and split your code into manageable chunks.
---

# Dynamic Import

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-dynamic-import">Dynamic Import</a></li>
  </ul>
</details>

Next.js supports ES2020 [dynamic `import()`](https://github.com/tc39/proposal-dynamic-import) for JavaScript. With it you can import JavaScript modules (inc. React Components) dynamically and work with them. They also work with SSR.

You can think of dynamic imports as another way to split your code into manageable chunks.

## Basic usage

```jsx
import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('../components/hello'))

function Home() {
  return (
    <div>
      <Header />
      <DynamicComponent />
      <p>HOME PAGE is here!</p>
    </div>
  )
}

export default Home
```

## With named exports

```jsx
// components/hello.js
export function Hello() {
  return <p>Hello!</p>
}

import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() =>
  import('../components/hello').then(mod => mod.Hello)
)

function Home() {
  return (
    <div>
      <Header />
      <DynamicComponent />
      <p>HOME PAGE is here!</p>
    </div>
  )
}

export default Home
```

## With custom loading component

```jsx
import dynamic from 'next/dynamic'

const DynamicComponentWithCustomLoading = dynamic(
  () => import('../components/hello'),
  { loading: () => <p>...</p> }
)

function Home() {
  return (
    <div>
      <Header />
      <DynamicComponentWithCustomLoading />
      <p>HOME PAGE is here!</p>
    </div>
  )
}

export default Home
```

## With no SSR

You may not always want to include a module on server-side, For example, when the module includes a library that only works in the browser.

Take a look at the following example:

```jsx
import dynamic from 'next/dynamic'

const DynamicComponentWithNoSSR = dynamic(
  () => import('../components/hello3'),
  { ssr: false }
)

function Home() {
  return (
    <div>
      <Header />
      <DynamicComponentWithNoSSR />
      <p>HOME PAGE is here!</p>
    </div>
  )
}

export default Home
```
