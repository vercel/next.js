import http from 'http'
import next, { NextServerConstructor } from '../next'

export default async function start(
  serverOptions: NextServerConstructor,
  port?: number,
  hostname?: string,
  /** if socket is provided, port and hostname is ignored */
  socket?: string
) {
  const app = next({
    ...serverOptions,
    customServer: false,
  })
  const srv = http.createServer(app.getRequestHandler())
  await new Promise((resolve, reject) => {
    // This code catches EADDRINUSE error if the port is already in use
    srv.on('error', reject)
    srv.on('listening', () => {
      return () => resolve()
    })

    if (socket) {
      srv.listen(socket)
    } else {
      srv.listen(port, hostname)
    }
  })
  // It's up to caller to run `app.prepare()`, so it can notify that the server
  // is listening before starting any intensive operations.
  return app
}
