# No Server Import In Page

> Prevent usage of `next/server` outside of `pages/_middleware.js`.

### Why This Error Occurred

`next/server` was imported outside of `pages/**/_middleware.{js,ts}`.

### Possible Ways to Fix It

Only import and use `next/server` in a file located within the pages directory: `pages/**/_middleware.{js,ts}`.

```ts
// pages/_middleware.ts

import type { NextFetchEvent, NextRequest } from 'next/server'

export function middleware(req: NextRequest, ev: NextFetchEvent) {
  return new Response('Hello, world!')
}
```

### Useful Links

- [Middleware](https://nextjs.org/docs/middleware)
