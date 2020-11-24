---
description: Next.js supports API Routes, which allow you to build your API without leaving your Next.js app. Learn how it works here.
---

# API Routes

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/api-routes">Basic API Routes</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/api-routes-middleware">API Routes with middleware</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/api-routes-graphql">API Routes with GraphQL</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/api-routes-rest">API Routes with REST</a></li>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/api-routes-cors">API Routes with CORS</a></li>
  </ul>
</details>

API routes provide a straightforward solution to build your **API** with Next.js.

Any file inside the folder `pages/api` is mapped to `/api/*` and will be treated as an API endpoint instead of a `page`. They are server-side only bundles and won't increase your client-side bundle size.

For example, the following API route `pages/api/user.js` handles a `json` response:

```js
export default function handler(req, res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ name: 'John Doe' }))
}
```

For an API route to work, you need to export a function as default (a.k.a **request handler**), which then receives the following parameters:

- `req`: An instance of [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage), plus some pre-built middlewares you can see [here](/docs/api-routes/api-middlewares.md)
- `res`: An instance of [http.ServerResponse](https://nodejs.org/api/http.html#http_class_http_serverresponse), plus some helper functions you can see [here](/docs/api-routes/response-helpers.md)

To handle different HTTP methods in an API route, you can use `req.method` in your request handler, like so:

```js
export default function handler(req, res) {
  if (req.method === 'POST') {
    // Process a POST request
  } else {
    // Handle any other HTTP method
  }
}
```

To fetch API endpoints, take a look into any of the examples at the start of this section.

## Caveats

- API Routes [do not specify CORS headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS), meaning they are **same-origin only** by default. You can customize such behavior by wrapping the request handler with the [cors middleware](/docs/api-routes/api-middlewares.md#connectexpress-middleware-support).
- API Routes can't be used with [`next export`](/docs/advanced-features/static-html-export.md)

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/api-routes/api-middlewares.md">
    <b>API Middlewares:</b>
    <small>learn about the built-in middlewares for the request.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/api-routes/response-helpers.md">
    <b>Response Helpers:</b>
    <small>learn about the built-in methods for the response.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/basic-features/typescript.md#api-routes">
    <b>TypeScript:</b>
    <small>Add TypeScript to your API Routes.</small>
  </a>
</div>
