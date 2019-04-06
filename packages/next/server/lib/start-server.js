import http from 'http'
import { resolve } from 'path'
import { existsSync } from 'fs'
import next from '../next'

export default async function start (serverOptions, port, hostname) {
  let srv
  const customServerPath = resolve(serverOptions.dir, 'next.server.js')
  if (existsSync(customServerPath)) {
    srv = require(customServerPath)
    if (!srv || typeof srv.listen !== 'function' || typeof srv.on !== 'function') {
      console.error('next.server.js should return http.Server instance')
      process.exit(1)
    }
  } else {
    const app = next(serverOptions)
    srv = http.createServer(app.getRequestHandler())
  }
  await new Promise((resolve, reject) => {
    // This code catches EADDRINUSE error if the port is already in use
    srv.on('error', reject)
    srv.on('listening', () => resolve())
    srv.listen(port, hostname)
  })
  // For backward compatiblity if someone wants to call this
  srv.prepare = srv.prepare || function () { }
  // It's up to caller to run `app.prepare()`, so it can notify that the server
  // is listening before starting any intensive operations.
  return srv
}
