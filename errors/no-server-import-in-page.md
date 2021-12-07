# No Server Import In Page

### Why This Error Occurred

`next/server` was imported in a page outside of `pages/_middleware.js` (or `pages/_middleware.tsx` if you are using TypeScript)

### Possible Ways to Fix It

Only import and use `next/server` within `pages/_middleware.js` (or `pages/_middleware.tsx`) to add middlewares.

```jsx
// pages/_middleware.ts

import type { NextFetchEvent, NextRequest } from 'next/server'

export function middleware(req: NextRequest, ev: NextFetchEvent) {
  return new Response('Hello, world!')
}
```

### Useful Links

- [Middleware](https://nextjs.org/docs/middleware)
