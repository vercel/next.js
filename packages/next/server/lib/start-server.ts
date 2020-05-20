import http from 'http'
import fs from 'fs'
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
      if (socket) {
        fs.chmodSync(socket, 0o777)
      }
      return () => resolve()
    })

    if (socket) {
      console.log('connecting to socket', socket)
      console.log('Socket stats:', fs.statSync(socket), {
        isSocket: fs.statSync(socket).isSocket(),
      })
      if (fs.existsSync(socket) && fs.statSync(socket).isSocket()) {
        fs.unlinkSync(socket)
      }
      srv.listen(socket)
    } else {
      srv.listen(port, hostname)
    }
  })
  // It's up to caller to run `app.prepare()`, so it can notify that the server
  // is listening before starting any intensive operations.
  return app
}
