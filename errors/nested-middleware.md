# Nested Middleware Deprecated

#### Why This Error Occurred

You are defining a middleware file in a location different from `pages/_middleware` which is _deprecated_.

Declaring a middleware file under specific pages brought the illusion that a middleware would be executed _only_ when pages below its declaration were matched but this wasn't the case.
Supporting this API also comes with other consequences like allowing to nest multiple middleware or dragging effects between different middleware executions.

This makes the execution model for middleware **really complex** and hard to reason about so this API is _deprecated_ in favour of a simpler model with a single root middleware.

#### Possible Ways to Fix It

To fix this error you must declare your middleware in the root pages folder and leverage `NextRequest` parsed URL to decide wether or not to execute the middleware code.
For example, a middleware declared under `pages/about/_middleware.js` can be moved to `pages/_middleware` and updated so that it only executes when `about/*` matches:

```typescript
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/about')) {
    // Execute pages/about/_middleware.js
  }
}
```

This also means that if you have more than one middleware you will need to reunite them in a single file and model their execution depending on the request.
