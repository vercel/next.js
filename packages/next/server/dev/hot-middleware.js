'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
class WebpackHotMiddleware {
  constructor(compilers) {
    this.onServerInvalid = () => {
      if (!this.serverError) return
      this.serverError = false
      if (this.clientLatestStats) {
        this.latestStats = this.clientLatestStats
        this.publishStats('built', this.latestStats)
      }
    }
    this.onClientInvalid = () => {
      if (this.closed || this.serverError) return
      this.latestStats = null
      this.eventStream.publish({
        action: 'building',
      })
    }
    this.onServerDone = (statsResult) => {
      if (this.closed) return
      // Keep hold of latest stats so they can be propagated to new clients
      // this.latestStats = statsResult
      // this.publishStats('built', this.latestStats)
      this.serverError = statsResult.hasErrors()
      if (this.serverError) {
        this.latestStats = statsResult
        this.publishStats('built', this.latestStats)
      }
    }
    this.onClientDone = (statsResult) => {
      this.clientLatestStats = statsResult
      if (this.closed || this.serverError) return
      // Keep hold of latest stats so they can be propagated to new clients
      this.latestStats = statsResult
      this.publishStats('built', this.latestStats)
    }
    this.middleware = (req, res, next) => {
      var ref
      if (this.closed) return next()
      if (
        !((ref = req.url) === null || ref === void 0
          ? void 0
          : ref.startsWith('/_next/webpack-hmr'))
      )
        return next()
      this.eventStream.handler(req, res)
      if (this.latestStats) {
        // Explicitly not passing in `log` fn as we don't want to log again on
        // the server
        this.publishStats('sync', this.latestStats)
      }
    }
    this.publishStats = (action, statsResult) => {
      const stats = statsResult.toJson({
        all: false,
        hash: true,
        warnings: true,
        errors: true,
      })
      this.eventStream.publish({
        action: action,
        hash: stats.hash,
        warnings: stats.warnings || [],
        errors: stats.errors || [],
      })
    }
    this.publish = (payload) => {
      if (this.closed) return
      this.eventStream.publish(payload)
    }
    this.close = () => {
      if (this.closed) return
      // Can't remove compiler plugins, so we just set a flag and noop if closed
      // https://github.com/webpack/tapable/issues/32#issuecomment-350644466
      this.closed = true
      this.eventStream.close()
    }
    this.eventStream = new EventStream()
    this.latestStats = null
    this.clientLatestStats = null
    this.serverError = false
    this.closed = false
    compilers[0].hooks.invalid.tap(
      'webpack-hot-middleware',
      this.onClientInvalid
    )
    compilers[0].hooks.done.tap('webpack-hot-middleware', this.onClientDone)
    compilers[1].hooks.invalid.tap(
      'webpack-hot-middleware',
      this.onServerInvalid
    )
    compilers[1].hooks.done.tap('webpack-hot-middleware', this.onServerDone)
  }
}
exports.WebpackHotMiddleware = WebpackHotMiddleware
class EventStream {
  constructor() {
    this.heartbeatTick = () => {
      this.everyClient((client) => {
        client.write('data: \ud83d\udc93\n\n')
      })
    }
    this.clients = new Set()
    this.interval = setInterval(this.heartbeatTick, 2500).unref()
  }
  everyClient(fn) {
    for (const client of this.clients) {
      fn(client)
    }
  }
  close() {
    clearInterval(this.interval)
    this.everyClient((client) => {
      if (!client.finished) client.end()
    })
    this.clients.clear()
  }
  handler(req, res) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/event-stream;charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // While behind nginx, event stream should not be buffered:
      // http://nginx.org/docs/http/ngx_http_proxy_module.html#proxy_buffering
      'X-Accel-Buffering': 'no',
    }
    const isHttp1 = !(parseInt(req.httpVersion) >= 2)
    if (isHttp1) {
      req.socket.setKeepAlive(true)
      Object.assign(headers, {
        Connection: 'keep-alive',
      })
    }
    res.writeHead(200, headers)
    res.write('\n')
    this.clients.add(res)
    req.on('close', () => {
      if (!res.finished) res.end()
      this.clients.delete(res)
    })
  }
  publish(payload) {
    this.everyClient((client) => {
      client.write('data: ' + JSON.stringify(payload) + '\n\n')
    })
  }
}

//# sourceMappingURL=hot-middleware.js.map
