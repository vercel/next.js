const { createServer } = require('node:http')
const { WebSocketServer } = require('next/dist/compiled/ws')
const next = require('next')

async function main() {
  const app = next({
    dev: true,
    dir: __dirname,
    webpack: process.env.IS_WEBPACK_TEST === '1',
  })
  await app.prepare()
  const handle = app.getRequestHandler()
  const upgrade = app.getUpgradeHandler()
  const sockets = new WebSocketServer({ noServer: true })
  const server = createServer(handle)
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/application-socket') {
      sockets.handleUpgrade(request, socket, head, (connection) => {
        connection.on('message', (message) =>
          connection.send(message.toString())
        )
      })
    } else if (process.env.ROUTING_UPGRADE_MODE === 'explicit') {
      upgrade(request, socket, head)
    }
  })
  server.listen(Number(process.env.PORT), () =>
    console.log(`- Local: http://localhost:${server.address().port}`)
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
