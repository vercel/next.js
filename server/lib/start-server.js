import http from 'http'
import Server from '../index'

export default async function start (serverOptions, port, hostname) {
  const app = new Server(serverOptions)
  await app.prepare()
  const srv = http.createServer(app.getRequestHandler())
  await new Promise((resolve, reject) => {
    // This code catches EADDRINUSE error if the port is already in use
    srv.on('error', reject)
    srv.on('listening', () => resolve())
    srv.listen(port, hostname)
  })
}
