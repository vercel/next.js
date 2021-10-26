# Middleware new signature

#### Why This Error Occurred

Your application is using a Middleware function that is using parameters from the deprecated API.

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

Update to use the new API for Middleware:

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
