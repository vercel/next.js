---
description: Streaming related APIs to build Next.js apps in streaming SSR or with React Server Components.
---

# next/streaming

The experimental `next/streaming` module provides streaming related APIs to port the existing functionality of Next.js apps to streaming scenarios and facilitate the usage of React Server Components.

## unstable_useWebVitalsReport

Next.js provides an App component level function `reportWebVitals` for tracking performance metrics, checkout [measuring-performance](docs/advanced-features/measuring-performance) for more details. With moving to server components, you might have a pure server side custom `_app` component which doesn't run client effects.

With the new `unstable_useWebVitalsReport` API, you're able to track web vitals metrics in client components.

```jsx
// pages/_app.js
import { unstable_useWebVitalsReport } from 'next/streaming'

export default function Home() {
  unstable_useWebVitalsReport((data) => {
    console.log(data)
  })

  return <div>Home Page</div>
}
```

This method could also be used to replace static exported `reportWebVitals` functions in your existing `_app`.

```jsx
// pages/_app.server.js
import Layout from '../components/layout.client.js'

export default function App({ children }) {
  return <Layout>{children}</Layout>
}
```

```jsx
// components/layout.client.js
import { unstable_useWebVitalsReport as useWebVitalsReport } from 'next/streaming'

export default function Layout() {
  useWebVitalsReport((data) => {
    console.log(data)
  })

  return (
    <div className="container">
      <h1>Hello</h1>
      <div className="main">{children}</div>
    </div>
  )
}
```

## unstable_useRefreshRoot

Since server components are rendered on the server side when requesting to server, in some cases you might need to partially refresh server rendered content.

For instance, let's say you build a search bar in a client component and display search results through server components. You'd want to update the search results while typing and re-render the results list with a certain frequency (e.g. with each keystroke or on a debounce).

The `unstable_useRefreshRoot` hook returns a `refresh` API to let you re-render the React tree smoothly without flickering. This is only allowed to be used on the client side and will only affect server components at the moment.

```jsx
// pages/index.server.js
import Search from '../components/search.client.js'
import SearchResults from '../components/search-results.server.js'

function Home() {
  return (
    <div>
      <Search />
      <SearchResults />
    </div>
  )
}
```

```jsx
// components/search.client.js
import { unstable_useRefreshRoot as useRefreshRoot } from 'next/streaming'

export default function Search() {
  const refresh = useRefreshRoot()

  return (
    <SearchUI
      onChange={() => {
        refresh()
      }}
    />
  )
}
```
