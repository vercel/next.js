# Entire page deopted into client-side rendering

#### Why This Error Occurred

During static rendering the entire page was deopted into client-side rendering by `useSearchParams` as there was no [Suspense boundary](https://beta.nextjs.org/docs/data-fetching/streaming-and-suspense#example-using-suspense-boundaries) that caught it.

If a route is statically rendered, calling `useSearchParams()` will cause the tree up to the closest [Suspense boundary](https://beta.nextjs.org/docs/data-fetching/streaming-and-suspense#example-using-suspense-boundaries) to be client-side rendered.

This allows a part of the page to be statically rendered while the dynamic part that uses `searchParams` can be client-side rendered.

#### Possible Ways to Fix It

You can reduce the portion of the route that is client-side rendered by wrapping the component that uses useSearchParams in a Suspense boundary.

For example if `app/dashboard/search-bar.tsx` uses `useSearchParams` wrap the component in a [Suspense boundary](https://beta.nextjs.org/docs/data-fetching/streaming-and-suspense#example-using-suspense-boundaries) as shown in `app/dashboard/page.tsx`.

```js
// app/dashboard/search-bar.tsx
'use client'

import { useSearchParams } from 'next/navigation'

export default function SearchBar() {
  const searchParams = useSearchParams()

  const search = searchParams.get('search')

  // This will not be logged on the server when using static rendering
  console.log(search)

  return <>Search: {search}</>
}
```

```js
// app/dashboard/page.tsx
import { Suspense } from 'react'
import SearchBar from './search-bar'

// This component passed as fallback to the Suspense boundary
// will be rendered in place of the search bar in the initial HTML.
// When the value is available during React hydration the fallback
// will be replaced with the `<SearchBar>` component.
function SearchBarFallback() {
  return <>placeholder</>
}

export default function Page() {
  return (
    <>
      <nav>
        <Suspense fallback={<SearchBarFallback />}>
          <SearchBar />
        </Suspense>
      </nav>
      <h1>Dashboard</h1>
    </>
  )
}
```

### Useful Links

- [`useSearchParams` static rendering documentation](https://beta.nextjs.org/docs/api-reference/use-search-params#static-rendering)
