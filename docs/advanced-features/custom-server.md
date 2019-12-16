# Custom Server

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/custom-server">Basic custom server</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/custom-server-express">Express integration</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/custom-server-hapi">Hapi integration</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/custom-server-koa">Koa integration</a></li>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/ssr-caching">SSR Catching</a></li>
  </ul>
</details>

Typically you start your next server with `next start`. It's possible, however, to start a server 100% programmatically in order to use custom route patterns.

> Before deciding to use a custom a custom server please keep in mind that it should only be used when the integrated router of Next.js can't meet your app requirements. A custom server will remove important performance optimizations, like **serverless functions** and **[Automatic Static Optimization](/docs/advanced-features/automatic-static-optimization.md).**

Take a look at the following example of a custom server:

```js
// server.js
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    // Be sure to pass `true` as the second argument to `url.parse`.
    // This tells it to parse the query portion of the URL.
    const parsedUrl = parse(req.url, true)
    const { pathname, query } = parsedUrl

    if (pathname === '/a') {
      app.render(req, res, '/b', query)
    } else if (pathname === '/b') {
      app.render(req, res, '/a', query)
    } else {
      handle(req, res, parsedUrl)
    }
  }).listen(3000, err => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
```

> `server.js` doesn't go through babel or webpack. Make sure the syntax and sources this file requires are compatible with the current node version you are running.

Then, to run the custom server you'll need to update the `scripts` in `package.json`, like so:

```json
"scripts": {
  "dev": "node server.js",
  "build": "next build",
  "start": "NODE_ENV=production node server.js"
}
```

---

The custom server uses the following import to connect the server with the Next.js application:

```js
const next = require('next')
const app = next({})
```

The above `next` import is a function that receives an object with the following options:

- `dev`: `Boolean` - Whether or not to launch Next.js in dev mode. Defaults `false`
- `dir`: `String` - Location of the Next.js project. Defaults to `'.'`
- `quiet`: `Boolean` - Hide error messages containing server information. Defaults to `false`
- `conf`: `object` - The same object you would use in [next.config.js](/docs/api-reference/next.config.js/introduction.md). Defaults to `{}`

The returned `app` can then be used to let Next.js handle requests as required.

## Disabling file-system routing

By default, `Next` will serve each file in the `pages` folder under a pathname matching the filename. If your project uses a custom server, this behavior may result in the same content being served from multiple paths, which can present problems with SEO and UX.

To disable this behavior & prevent routing based on files in `pages`, open `next.config.js` and disable the `useFileSystemPublicRoutes` config:

```js
module.exports = {
  useFileSystemPublicRoutes: false,
}
```

> Note that `useFileSystemPublicRoutes` simply disables filename routes from SSR; client-side routing may still access those paths. When using this option, you should guard against navigation to routes you do not want programmatically.

> You may also wish to configure the client-side Router to disallow client-side redirects to filename routes; for that refer to [`Router.beforePopState`](/docs/api-reference/next/router.md#router.beforePopState).

## Dynamic `assetPrefix`

Sometimes you may need to set the [`assetPrefix`](/docs/api-reference/next.config.js/cdn-support-with-asset-prefix.md) dynamically. This is useful when changing the `assetPrefix` based on incoming requests.

For that, you can use `app.setAssetPrefix`, as in the following example:

```js
const next = require('next')
const http = require('http')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handleNextRequests = app.getRequestHandler()

app.prepare().then(() => {
  const server = new http.Server((req, res) => {
    // Add assetPrefix support based on the hostname
    if (req.headers.host === 'my-app.com') {
      app.setAssetPrefix('http://cdn.com/myapp')
    } else {
      app.setAssetPrefix('')
    }

    handleNextRequests(req, res)
  })

  server.listen(port, err => {
    if (err) {
      throw err
    }

    console.log(`> Ready on http://localhost:${port}`)
  })
})
```
