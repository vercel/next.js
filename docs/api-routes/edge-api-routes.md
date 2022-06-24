---
description: You can add the dynamic routes used for pages to API Routes too. Learn how it works here.
---

# Edge API Routes (Beta)

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/examples/blob/main/edge-functions/api-route/api/edge.ts">Basic Edge API Route</a></li>
  </ul>
</details>

Edge API Routes are similar to API Routes but use the Edge Runtime. Unlike API Routes, Edge API Routes:

- Can stream responses
- Run _after_ the cache

## How to create an Edge API Route

Edge API Routes have the same signature as [Edge Middleware](/docs/advanced-features/middleware), and support the same helpers from [`next/server`](/docs/api-reference/next/server). Note that the below examples use TypeScript, though this is **not** a requirement.

### Edge API Route

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default (req: NextRequest) => {
  return new Response(`Hello, from ${req.url} I'm now an Edge API Route!`)
}

export const config = {
  runtime: 'experimental-edge',
}
```

## Trade-offs

Edge API Routes are not suitable for all use cases:

- Fetching data in an Edge API Routes from a location far away from its deployed location can add unwanted latency to the request
- The maximum size for an Edge API Route is 1 MB, including all the code that is bundled in the function
- **Native Node.js APIs are not supported**:
  - ES modules `require()` is not allowed
  - Libraries using Node.js APIs can't be used in Edge API Routes
  - Dynamic code execution (such as `eval`) is not allowed