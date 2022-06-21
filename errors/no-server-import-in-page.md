# No Server Import In Page

> Prevent usage of `next/server` outside of `middleware.js`.

### Why This Error Occurred

`next/server` was imported outside of `middleware.{js,ts}` or other allowed files.

### Possible Ways to Fix It

Only import and use `next/server` in a file located within the project root directory: `middleware.{js,ts}`.

```ts
// middleware.ts

import type { NextFetchEvent, NextRequest } from 'next/server'

export function middleware(req: NextRequest, ev: NextFetchEvent) {
  return new Response('Hello, world!')
}
```

### Options

#### `allow`

Allow files matching the provided glob pattern(s) to use `next/server`. This is useful to allow test files to use `next/server`. This can be a glob pattern or an array of glob patterns.

```json
{
  "rules": {
    "@next/next/no-server-import-in-page": [
      "error",
      ["**/*.{spec,test}.{js,jsx,ts,tsx}", "__tests__/**/*.{js,ts}"]
    ]
  }
}
```

### Useful Links

- [Middleware](https://nextjs.org/docs/middleware)
