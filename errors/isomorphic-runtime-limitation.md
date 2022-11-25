# Isomorphic runtime limitation

#### Why This Error Occurred

One of your API routes is exporting an default function compliant with edge signature (also known as isomorphic signature):

```ts
export default async function (request: Request): Promise<Response> {
  // ...
}
```

However, this API route fails when invoked because it is running on Node.js 17 or lower.

#### Possible Ways to Fix It

Isomorphic signature expects `Request`, `Response` and other fetch-compliant constructor to be available in the global scope: upgrading your version of Node.js to 18 (or later) will fix the error.

When the Node.js migration is not acceptable, you will have to rewrite your API route so it complies with Node.js handler signature:

```ts
import type { IncomingMessage, ServerResponse } from 'http'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // ...
}
```

### Useful Links

- [Fetch specification](https://fetch.spec.whatwg.org/#fetch-api) (Headers, Request, Response, fetch method)
- [Configure Node.js version on Vercel](https://vercel.com/docs/concepts/functions/serverless-functions/runtimes/node-js)
