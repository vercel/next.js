The product pages prefetch their data into React Query (TanStack Query) on the server and hydrate it in the browser. Navigating away and back with the product links repeats the server seed work and the product briefly reloads even though the browser already had the query cached.

Make warm client navigations reuse the cached route and preserve the React Query cache. Keep the initial server-provided data and normal Next.js file-system routing.
