# Middleware Relative URLs

#### Why This Error Occurred

You are using a Middleware function that uses `Response.redirect(url)`, `NextResponse.redirect(url)` or `NextResponse.rewrite(url)` where `url` is a relative or an invalid URL. Currently this will work, but building a request with `new Request(url)` or running `fetch(url)` when `url` is a relative URL will **not** work. For this reason and to bring consistency to Next.js Middleware, this behavior will be deprecated soon in favor of always using absolute URLs.

#### Possible Ways to Fix It

To fix this warning you must always pass absolute URL for redirecting and rewriting. There are several ways to get the absolute URL but the recommended way is to clone `NextURL` and mutate it:

```typescript
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = '/dest'
  return NextResponse.rewrite(url)
}
```

Another way to fix this error could be to use the original URL as the base but this will not consider configuration like `basePath` or `locale`:

```typescript
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  return NextResponse.rewrite(new URL('/dest', request.url))
}
```

Or you can simply pass a string containing a valid absolute URL.

### Useful Links

- [URL Documentation](https://developer.mozilla.org/en-US/docs/Web/API/URL)
- [Response Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Response)
