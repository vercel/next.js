# Using Node.js module in Edge runtime

#### Why This Error Occurred

The code in your [Middleware][middleware] or your [Edge API routes][routes] is using a feature from Node.js runtime.

However, the Edge Runtime does not support [Node.js APIs and primitives][node-primitives].

#### Possible Ways to Fix It

When it runs in dev mode, your application will show in the console, and in your browser, which file is importing and using an unsupported primitive.
This primitive must be avoided: either by not using it, or by using a polyfill.

Please note your code can import Node.js modules **as long as they are not used**.
The following example builds and works at runtime:

```ts
import { NextResponse } from 'next/server'
import { spawn } from 'child_process'

export default async function middleware() {
  if (process.version) {
    spawn('ls', ['-lh'])
  }
  return NextResponse.next()
}
```

Dynamic imports in unreachable code path is also supported.

### Useful Links

- [Edge runtime supported APIs and primitives][edge-primitives]
- [Next.js Middleware][middleware]

[middleware]: https://nextjs.org/docs/advanced-features/middleware
[routes]: https://nextjs.org/docs/api-routes/edge-api-routes
[node-primitives]: https://nodejs.org/api/index.html
[edge-primitives]: https://edge-runtime.vercel.app/features/available-apis