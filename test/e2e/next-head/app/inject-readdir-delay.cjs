const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')

const pagesDir = path.join(process.cwd(), 'pages')
const originalReaddir = fs.readdir
let injected = false
let released = false
const origin = process.env.ROUTING_ROUTE_SCAN_CONTROL_ORIGIN

const originalEmit = http.Server.prototype.emit
http.Server.prototype.emit = function (event, ...args) {
  if (
    origin &&
    event === 'request' &&
    args[0].url?.includes('__route_readiness=1')
  ) {
    http
      .get(origin + '/request', (response) => response.resume())
      .on('error', () => {})
  }
  return originalEmit.call(this, event, ...args)
}
const originalWriteHead = http.ServerResponse.prototype.writeHead
http.ServerResponse.prototype.writeHead = function (...args) {
  if (
    origin &&
    injected &&
    this.req?.url?.includes('__route_readiness=1') &&
    !released
  ) {
    throw new Error(
      'Route response committed before the initial route inventory was released'
    )
  }
  return originalWriteHead.apply(this, args)
}

fs.readdir = function readdir(directory, ...args) {
  const stack = new Error().stack
  if (!injected && directory === pagesDir && stack.includes('watchpack')) {
    injected = true
    console.log('[next-head] delaying initial Watchpack pages scan')
    if (!origin) throw new Error('Missing initial-scan release barrier')
    const self = this
    http
      .get(origin + '/scan', (response) => {
        response.resume()
        response.on('end', () => {
          released = true
          originalReaddir.call(self, directory, ...args)
        })
      })
      .on('error', (error) => {
        throw error
      })
    return
  }

  return originalReaddir.call(this, directory, ...args)
}
