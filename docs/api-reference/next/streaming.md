---
description: Streaming related APIs to build Next.js apps in streaming SSR or with React Server Components.
---

# next/streaming

The `next/streaming` module provides streaming related APIs to port the existing functionality of Next.js app to streaming scenarios or assign users ability to interact much easier with React Server Components.

## unstable_useWebVitalsReport

Next.js provides an App component level function `reportWebVitals` for tracking performance metrics, checkout [measuring-performance](docs/advanced-features/measuring-performance) for more details. With moving to server components, you might have a pure server side custom `_app` component which doesn't run client effects.

With this API, you're able to track web vitals metrics through this hook in client components.

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

Or it could also be an alternative way for you to replace static exported `reportWebVitals` function in your existing \_app.

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

Since server components are rendered on server side when requesting to server, in some case you might need to partially refresh server rendered content.

For instance, you build a search bar in client component and display few search results by server components, you'd like to update the search results while typing. Then you'd like to re-render the results list in a certain frequency, it could be each typing, or be batched by debounce.

The hook `unstable_useRefreshRoot` returns a `refresh` API to let you rerender the React tree smoothly without flicking. This is only allowed to be used on client side and will only effect server components so far.

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
