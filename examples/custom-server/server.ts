import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
// Enable when you add a custom socket handler, as Next.js uses websockets in development.
const upgradeHandler = app.getUpgradeHandler()
const handler = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handler(req, res, parsedUrl)
  }).listen(port)

  // Enable when you add a custom socket handler as Next.js will set up
  server.on('upgrade', (req, socket, head) => {
    // Enable when you add a custom socket handler, as Next.js uses websockets in development.
    upgradeHandler(req, socket, head)
  })

  console.log(
    `> Server listening at http://localhost:${port} as ${
      dev ? 'development' : process.env.NODE_ENV
    }`
  )
})
