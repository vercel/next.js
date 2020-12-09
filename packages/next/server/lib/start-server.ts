import http from 'http'
import net from 'net'
import next from '../next'
import { promises as fs } from 'fs'

// Check to see if a Unix socket actually has something accepting connections
// on the other side. Returns `true` only for `ECONNREFUSED`.
async function isStaleSocket(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket()
    sock.on('error', (err: any) => {
      resolve(err.code === 'ECONNREFUSED')
    })
    sock.on('connect', () => {
      sock.destroy()
      resolve(false)
    })
    sock.connect(socketPath)
  })
}

export default async function start(serverOptions: any, ...listenArgs: any[]) {
  const app = next({
    ...serverOptions,
    customServer: false,
  })

  const handler = app.getRequestHandler()
  async function createServer() {
    const srv = http.createServer(handler)
    return new Promise((resolve, reject) => {
      // This code catches EADDRINUSE error if the port is already in use
      srv.on('error', reject)
      srv.on('listening', () => resolve(srv))
      srv.listen(...listenArgs)
    })
  }

  try {
    await createServer()
  } catch (err) {
    // If we got EADDRINUSE on a Unix socket, check if the socket is stale.
    // If so, unlink the socket it and retry listening.
    const socketPath = typeof listenArgs[0] === 'string' ? listenArgs[0] : null
    if (
      socketPath &&
      err.code === 'EADDRINUSE' &&
      (await isStaleSocket(socketPath))
    ) {
      await fs.unlink(socketPath)
      await createServer()
    } else {
      throw err
    }
  }

  // It's up to caller to run `app.prepare()`, so it can notify that the server
  // is listening before starting any intensive operations.
  return app
}
