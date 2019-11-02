# Introduction

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/api-routes">Basic API Routes</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/api-routes-micro">API Routes with Micro</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/api-routes-middleware">API Routes with middleware</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/api-routes-graphql">API Routes with GraphQL</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/api-routes-rest">API Routes with REST</a></li>
  </ul>
</details>
<br/>

API routes provides a straightforward solution to build your **API** with Next.js.

Any file inside the folder `pages/api` is mapped to `/api/*` and will be treated as an API endpoint instead of a `page`.

For example, the following API route `pages/api/user.js` handles a simple `json` response:

```js
export default (req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ name: 'Jhon Doe' }))
}
```

For an API route to work, you need to export as default a function (a.k.a **request handler**), which then receives the following parameters:

- `req`: An instance of [http.IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage), plus some pre-built middlewares you can see [here](https://www.notion.so/zeithq/API-Middlewares-96bca263874e4712936b87d15d428446)
- `res`: An instance of [http.ServerResponse](https://nodejs.org/api/http.html#http_class_http_serverresponse), plus some helper functions you can see [here](https://www.notion.so/zeithq/Response-helpers-703b943e7b4740478184fa1b5266881d)

To handle different HTTP methods in an API route, you can use `req.method` in your request handler, like so:

```js
export default (req, res) => {
  if (req.method === 'POST') {
    // Process a POST request
  } else {
    // Handle any other HTTP method
  }
}
```

> API Routes [do not specify CORS headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS), meaning they are **same-origin only** by default. You can customize such behavior by wrapping the request handler with [micro-cors](https://www.notion.so/zeithq/API-Middlewares-96bca263874e4712936b87d15d428446#2aaf9e63b00244fdbce512116692772b).

> API Routes do not increase your client-side bundle size. They are server-side only bundles.
