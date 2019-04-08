const express = require(`express`)
const next = require(`next`)

const routes = require(`./redirects`)

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== `production`
const app = next({ dev })
const handle = app.getRequestHandler()

app
  .prepare()
  .then(() => {
    const server = express()

    // This allows the app to respond to the dynamic routes like `/posts/{postId}` and is the
    // Next.js equivalent of the redirects in serve.json file. See scripts/build-serve-config.js
    routes.forEach(route => {
      server.get(route.externalURL, (req, res) =>
        app.render(req, res, route.staticPage, req.params)
      )
    })

    server.get(`*`, (req, res) => handle(req, res))

    server.listen(port, err => {
      if (err) {
        throw err
      }
      console.log(`> Ready on http://localhost:${port}`)
    })
  })
  .catch(err => {
    console.error(err.stack)
    process.exit(1)
  })
