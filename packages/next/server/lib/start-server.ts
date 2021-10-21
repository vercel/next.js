import http from 'http'
import next from '../next'

export default async function start(
  serverOptions: any,
  port?: number,
  hostname?: string
) {
  let requestHandler: ReturnType<typeof app.getRequestHandler>
  const srv = http.createServer((req, res) => {
    return requestHandler(req, res)
  })
  const app = next({
    ...serverOptions,
    customServer: false,
    httpServer: srv,
  })
  requestHandler = app.getRequestHandler()

  await new Promise<void>((resolve, reject) => {
    // This code catches EADDRINUSE error if the port is already in use
    srv.on('error', reject)
    srv.on('listening', () => resolve())
    srv.listen(port, hostname)
  })
  // It's up to caller to run `app.prepare()`, so it can notify that the server
  // is listening before starting any intensive operations.
  const addr = srv.address()
  return {
    app,
    actualPort: addr && typeof addr === 'object' ? addr.port : port,
  }
}
