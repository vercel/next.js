import http from 'http'
import next from '../next'

export default async function start (serverOptions, port, hostname) {
  const app = next(serverOptions)
  await app.prepare()
  const srv = http.createServer(app.getRequestHandler())
  await new Promise((resolve, reject) => {
    // This code catches EADDRINUSE error if the port is already in use
    srv.on('error', reject)
    srv.on('listening', () => resolve())
    srv.listen(port, hostname)
  })
}
