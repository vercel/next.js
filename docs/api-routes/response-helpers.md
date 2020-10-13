---
description: API Routes include a set of Express.js-like methods for the response to help you creating new API endpoints. Learn how it works here.
---

# Response Helpers

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/api-routes">Basic API Routes</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/api-routes-rest">API Routes with REST</a></li>
  </ul>
</details>

The response (`res`) includes a set of Express.js-like methods to improve the developer experience and increase the speed of creating new API endpoints, take a look at the following example:

```js
export default function handler(req, res) {
  res.status(200).json({ name: 'Next.js' })
}
```

The included helpers are:

- `res.status(code)` - A function to set the status code. `code` must be a valid [HTTP status code](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes)
- `res.json(json)` - Sends a JSON response. `json` must be a valid JSON object
- `res.send(body)` - Sends the HTTP response. `body` can be a `string`, an `object` or a `Buffer`
- `res.redirect([status,] path)` - Redirects to a specified path or URL. `status` must be a valid [HTTP status code](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes). If not specified, `status` defaults to "307" "Found".

Additionally, a custom error may be thrown from a handler as follows:

```js
import { NextApiError } from 'next'

export default async function handler(req, res) {
  function authorize() {
    if (!req.headers.authorization) {
      res.setHeader('WWW-Authenticate', 'Basic')
      throw new NextApiError(401, 'Authentication required')
    }

    // Example from: https://tools.ietf.org/html/rfc7617
    // user-id: 'Aladdin', password: 'open sesame'
    if (req.headers.authorization !== 'Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==') {
      throw NextApiError(403) // Message gets set to 'Forbidden', as in RFC 7231
    }
  }

  if (req.method === 'DELETE') {
    authorize() // Can be reused across mutating HTTP methods
    database.delete(/* Custom business logic... */)
    res.status(204).end()
  } else if (req.method === 'GET') {
    // No authorization is necessary here
    res.json({ hello: 'world' })
  }
}
```
