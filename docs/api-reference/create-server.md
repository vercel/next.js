---
description: Create a custom server for your Next.js app programatically.
---

# Create Server

The main export from the `next` package is a function which returns a new Next.js server instance. This can be used in your existing server backend to implement the same behaviour as the `next start` and `next dev` CLI commands.

> **Note: This is API documentation for the Next.js server. For a feature overview and usage information for custom server implementations, please see [Custom Server](/docs/advanced-features/custom-server.md).**

> Note: The Next.js server instance is responsible for sending responses to the client and will call [response.end](https://nodejs.org/api/http.html#responseenddata-encoding-callback) when a response is sent.

```js
const { createServer } = require('http')
const next = require('next')

const app = next({
  dev: process.env.NODE_ENV !== 'production',
})

const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer(async (req, res) => {
    await handle(req, res)
  }).listen(port)
})
```

## Options

The Next.js server accepts these options:

- `dev`: Enable dev mode. Defaults to `false`
- `dir`: Optional path to the directory of the Next.js application. If no directory is provided, the current directory will be used.
- `quiet`: Hide error messages containing server information. Defaults to `false`
- `conf`: Optional object containing the app configuration - see [next.config.js](/docs/api-reference/next.config.js/introduction)

The `hostname` and `port` options must be provided when using [middleware](/docs/middleware):

- `hostname`: The hostname the server is running behind
- `port`: The port the server is running behind

## app.getRequestHandler

```js
const handle = app.getRequestHandler()
await handle(req, res)
```

The `getRequestHandler` function returns a request handler.

The handler should be called with an [http.IncomingMessage](https://nodejs.org/api/http.html#class-httpincomingmessage)(https://nodejs.org/api/http.html#class-httpserver) and [http.ServerResponse](https://nodejs.org/api/http.html#class-httpserverresponse) originating from your existing server. The handler will serve resources to the client like pages, scripts, static files and API routes.

## app.prepare

The `prepare` function returns a promise which should be awaited before handling incoming requests to allow the Next.js server to start properly.

## app.render

The `render` function handles an incoming request and serves a page to the client.

```js
const pathname = '/a'
await app.render(req, res, pathname)
```

The `pathname` should be the path to a page in `/pages`, the configured `basePath` or `locale` should not be included.

## app.renderError

The `renderError` function handles an incoming request and serves an error page to the client

```js
const pathname = '/a'
const err = new Error('Something went wrong')
res.statusCode = 404
await app.renderError(err, req, res, pathname)
```

The page served to the client is based on the status code of the given server response.

To render custom error pages for different status codes, see [Custom Error Page](/docs/advanced-features/custom-error-page).
