# Middleware new signature

#### Why This Error Occurred

Your application is using a Middleware function and your are using its parameters as with the deprecated API.

```typescript
import { NextResponse } from 'next/server'

export function middleware(event) {
  if (event.request.nextUrl.pathname === '/blocked') {
    event.respondWith(
      new Response(null, {
        status: 403,
      })
    )
  }
}
```

#### Possible Ways to Fix It

You can use the Middleware function with the most recent API:

```typescript
import { NextResponse } from 'next/server'

export function middleware(request) {
  if (request.nextUrl.pathname === '/blocked') {
    return new Response(null, {
      status: 403,
    })
  }
}
```
