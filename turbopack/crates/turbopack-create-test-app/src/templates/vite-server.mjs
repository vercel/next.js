import express from 'express'
import { createServer as createViteServer } from 'vite'

const TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Turbopack Test App</title>
  </head>
  <body>
    <div id="app"><!--ssr-outlet--></div>
    <script type="module" src="/src/vite-entry-client.jsx"></script>
  </body>
</html>`

async function createServer() {
  const app = express()
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })
  app.use(vite.middlewares)
  app.use('*', async (req, res, next) => {
    const url = req.originalUrl
    try {
      const template = await vite.transformIndexHtml(url, TEMPLATE)
      const { render } = await vite.ssrLoadModule('/src/vite-entry-server.jsx')
      const appHtml = await render(url)
      const html = template.replace(`<!--ssr-outlet-->`, appHtml)
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
    } catch (e) {
      vite.ssrFixStacktrace(e)
      next(e)
    }
  })

  const listener = app.listen(0, () => {
    console.log(`Local: http://localhost:${listener.address().port}`)
  })
}

createServer()
