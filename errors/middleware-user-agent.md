# Removed req.ua from Middleware API

#### Why This Error Occurred

Your middleware is interacting with `req.ua` and it's being deprecated

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const url = request.nextUrl
  const viewport = request.ua.device.type === 'mobile' ? 'mobile' : 'desktop'
  url.searchParams.set('viewport', viewport)
  return NextResponse.rewrites(url)
}
```

#### Possible Ways to Fix It

You should to use the function `userAgent` instead:

```typescript
// middleware.ts
import { NextRequest, NextResponse, userAgent } from 'next/server'

export function middleware(request: NextRequest) {
  const url = request.nextUrl
  const { device } = userAgent(request)
  const viewport = device.type === 'mobile' ? 'mobile' : 'desktop'
  url.searchParams.set('viewport', viewport)
  return NextResponse.rewrites(url)
}
```
