import http from 'node:http'
import next from 'next'

const port = Number(process.env.PORT) || 3000
const slowUpgradeGateSymbol = Symbol.for(
  'next.test.websocket-route-handlers-shutdown.slow-gate'
)
let releaseSlowUpgrade
const slowUpgradeGate = new Promise((resolve) => {
  releaseSlowUpgrade = resolve
})
globalThis[slowUpgradeGateSymbol] = slowUpgradeGate

let handle
const server = http.createServer((request, response) => {
  if (request.url === '/__close-next') {
    response.statusCode = 202
    response.end('closing')
    setImmediate(() => {
      void closeNext().catch((error) => {
        console.error(error)
        process.exitCode = 1
      })
    })
    return
  }

  if (request.url === '/__release-slow') {
    response.statusCode = 204
    response.end()
    releaseSlowUpgrade()
    return
  }

  if (request.url === '/__upgrade-listener-count') {
    response.end(String(server.listenerCount('upgrade')))
    return
  }

  if (request.url === '/__attach-duplicate-next-upgrade') {
    server.on('upgrade', app.getUpgradeHandler())
    response.statusCode = 204
    response.end()
    return
  }

  void handle(request, response)
})

const manualUpgradeOwner = process.env.NEXT_TEST_MANUAL_UPGRADE_OWNER === '1'
const appOptions = {
  dev: process.env.NODE_ENV !== 'production',
  hostname: 'localhost',
  port,
}
if (!manualUpgradeOwner) {
  appOptions.httpServer = server
}
const app = next(appOptions)

await app.prepare()
handle = app.getRequestHandler()

if (manualUpgradeOwner) {
  server.on('upgrade', (request, socket) => {
    if (request.url?.startsWith('/ws')) {
      // Run before Next's listener but claim the socket asynchronously. Next
      // must still delegate instead of inferring ownership from socket state.
      setImmediate(() => {
        socket.end(
          "HTTP/1.1 418 I'm a Teapot\r\n" +
            'Connection: close\r\n' +
            'Content-Length: 0\r\n' +
            '\r\n'
        )
      })
    }
  })
  server.on('upgrade', app.getUpgradeHandler())
}

let closeNextPromise
function closeNext() {
  if (!closeNextPromise) {
    console.log('[custom-server] next app closing')
    closeNextPromise = app.close().then(() => {
      console.log('[custom-server] next app closed')
      console.log(
        `[custom-server] upgrade listeners after app.close(): ${server.listenerCount('upgrade')}`
      )
    })
  }
  return closeNextPromise
}

let shutdownPromise
async function shutdown() {
  shutdownPromise ??= (async () => {
    const httpClosed = new Promise((resolve) => {
      server.close((error) => {
        if (error) console.error(error)
        resolve()
      })
    })
    await closeNext()
    await httpClosed
  })()

  await shutdownPromise
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.listen(port, () => {
  console.log(`Custom server ready\n- Local:        http://localhost:${port}`)
})
