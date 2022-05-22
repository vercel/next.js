# Nested Middleware

#### Why This Error Occurred

You are defining a middleware file in a location different from `<root>/middleware` which is not allowed.

While in beta, a middleware file under specific pages implied that it would _only_ be executed when pages below its declaration were matched.
This execution model allowed the nesting of multiple middleware, which is hard to reason about and led to consequences such as dragging effects between different middleware executions.

The API has been removed in favor of a simpler model with a single root middleware.

#### Possible Ways to Fix It

To fix this error, declare your middleware in the root folder and use `NextRequest` parsed URL to define which path the middleware code should be executed for. For example, a middleware declared under `pages/about/_middleware.js` can be moved to `middleware`. A conditional can be used to ensure the middleware executes only when it matches the `about/*` path:

```typescript
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/about')) {
    // Execute pages/about/_middleware.js
  }
}
```

If you have more than one middleware, you will need to combine them into a single file and model their execution depending on the request.
