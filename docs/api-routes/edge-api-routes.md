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

API Routes can be configured to run at the Edge using an experimental flag. When deployed on Vercel, these API Routes run as [Edge Functions](https://vercel.com/docs/concepts/functions/vercel-edge-functions).

Edge API Routes are similar to API Routes but with different infrastructure:

- API Routes are run from either the default region (us-east) or your selected region. On every invocation they are run from the same region
- Edge API Routes are copied across the [Vercel Edge Network](https://vercel.com/docs/concepts/edge-network/overview), so on every invocation, the region that is closets to you will run the function, reducing latency massively

Unlike API Routes, Edge API Routes:

- Can stream responses
- Run _after_ the cache
- Can cache responses
- Have zero cold starts

They enable you to move your server-side logic to the Edge, **geographically closer** to your sites visitors origin.

## How to create an Edge API Route

Edge API Routes have the same signature as [Edge Middleware](/docs/advanced-features/middleware), and support the same helpers from [`next/server`](/docs/api-reference/next/server). Note that the below examples use TypeScript, though this is **not** a requirement.

### API Route

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'

export default (req: NextApiRequest, res: NextApiResponse) => {
  res
    .status(200)
    .json({ name: `Hello, from ${req.url} I'm a Serverless Function'` })
}
```

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

- Fetching data in an Edge API Routes from a location far away from its deployed location can add un-wanted latency to the request
- The maximum size for an Edge API Route is 1 MB, including all the code that is bundled in the function
- **Native Node.js APIs are not supported**:
  - ES modules `require()` is not allowed
  - Libraries using Node.js APIs can't be used in Edge API Routes
  - Dynamic code execution (such as `eval`) is not allowed

For more information on limitations when using Edge API Routes, see the Vercel Edge Functions [Limitations documentation](https://vercel.com/docs/concepts/functions/vercel-edge-functions/limitations).
