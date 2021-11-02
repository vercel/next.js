---
description: 'Learn how to use SWR, a data fetching React hook that handles caching, revalidation, focus tracking, refetching on interval and more.'
---

# SWR

The team behind Next.js has created a React hook for data fetching called [**SWR**](https://swr.vercel.app/). It is highly recommend if you are fetching data on the client side. It handles caching, revalidation, focus tracking, refetching on interval, and more.

```jsx
import useSWR from 'swr'

function Profile() {
  const { data, error } = useSWR('/api/user', fetch)

  if (error) return <div>failed to load</div>
  if (!data) return <div>loading...</div>
  return <div>hello {data.name}!</div>
}
```

[Check out the SWR documentation to learn more](https://swr.vercel.app/).
