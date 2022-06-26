---
description: Edge API Routes enable you to build high performance APIs directly inside your Next.js application.
---

# Edge API Routes (Beta)

Edge API Routes enable you to build high performance APIs with Next.js.

Any file inside the folder `pages/api` is mapped to `/api/*` and will be treated as an API endpoint instead of a page. They are server-side only bundles and won't increase your client-side bundle size.

## Examples

### Basic

```typescript
export const config = {
  runtime: 'experimental-edge',
}

export default (req) => new Response('Hello world!')
```

### JSON Response

```typescript
import type { NextRequest } from 'next/server'

export const config = {
  runtime: 'experimental-edge',
}

export default async function handler(req: NextRequest) {
  return new Response(
    JSON.stringify({
      name: 'Jim Halpert',
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }
  )
}
```

### Cache-Control

```typescript
import type { NextRequest } from 'next/server'

export const config = {
  runtime: 'experimental-edge',
}

export default async function handler(req: NextRequest) {
  return new Response(
    JSON.stringify({
      name: 'Jim Halpert',
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, s-maxage=1200, stale-while-revalidate=600',
      },
    }
  )
}
```

### Query Parameters

```typescript
import type { NextRequest } from 'next/server'

export const config = {
  runtime: 'experimental-edge',
}

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  return new Response(email)
}
```

## Differences between API Routes

Edge API Routes are built on the [Edge Runtime](https://edge-runtime.vercel.app/) – they have the same API signature as [Edge Middleware](/docs/advanced-features/middleware). However, Edge API Routes can [stream responses](https://edge-runtime.vercel.app/features/available-apis#web-stream-apis) from the server and run _after_ cached files (e.g. HTML, CSS, JavaScript) have been accessed.

The [Edge Runtime](https://edge-runtime.vercel.app/) does impose some contstraints to enable high performance and security:

- The maximum size for an Edge API Route is 1 MB, including all the code that is bundled in the function
- Node.js APIs (such as `fs`) can't be used inside Edge API Routes
- Dynamic code execution (such as `eval`) is not allowed

[See all of the supported APIs](https://edge-runtime.vercel.app/features/available-apis) for the Edge Runtime.
