import next from 'next'
import * as http from 'node:http'

async function main() {
  const currentPort = parseInt(process.env.PORT, 10) || 3000
  const isDev = process.env.NODE_ENV !== 'production'

  const nextServer = next({
    hostname: 'localhost',
    port: currentPort,
    dev: isDev,
    quiet: false,
  })

  await nextServer.prepare()
  const nextRequestHandler = nextServer.getRequestHandler()

  const httpServer = http.createServer(async (req, res) => {
    try {
      await nextRequestHandler(req, res)
    } catch (err) {
      console.error(err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  const cleanup = once(async () => {
    // in dev, there might be a devserver websocket connection
    // that prevents `httpServer.close` from completing, so skip it
    if (!isDev) {
      console.log('closing HTTP server...')
      await new Promise((resolve) =>
        httpServer.close((err) => {
          if (err) {
            console.error(err)
          }
          resolve()
        })
      )
    }

    console.log('closing Next server...')
    await nextServer.close()

    console.log('cleanup finished')
  })

  /** @type {NodeJS.SignalsListener} */
  const onShutdownSignal = async (signal) => {
    console.log('onShutdownSignal', signal)
    try {
      await cleanup()
    } finally {
      process.exit(0)
    }
  }

  process.on('SIGTERM', onShutdownSignal)
  process.on('SIGINT', onShutdownSignal)

  try {
    await new Promise((resolve, reject) => {
      httpServer.listen(currentPort, (err) => (err ? reject(err) : resolve()))
    })
    console.log(
      [
        `Custom server started`,
        // next test modes parse this to find the appUrl
        `- Local:        http://${nextServer.hostname}:${nextServer.port}`,
      ].join('\n')
    )
  } catch (err) {
    console.error('Failed to start server', err)
    process.exit(1)
  }
}

/**
 * @template T
 * @param {() => T} cb
 * @returns {() => T} cb
 * */
function once(cb) {
  let state = { didRun: false, value: undefined }
  return () => {
    if (!state.didRun) {
      state = { didRun: true, value: cb() }
    }
    return state.value
  }
}

main()
