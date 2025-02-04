// Based on https://github.com/webpack-contrib/webpack-hot-middleware/blob/9708d781ae0e46179cf8ea1a94719de4679aaf53/middleware.js
// Included License below

// Copyright JS Foundation and other contributors

// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// 'Software'), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:

// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type ws from 'next/dist/compiled/ws'
import { isMiddlewareFilename } from '../../build/utils'
import type { VersionInfo } from './parse-version-info'
import type { HMR_ACTION_TYPES } from './hot-reloader-types'
import { HMR_ACTIONS_SENT_TO_BROWSER } from './hot-reloader-types'

function isMiddlewareStats(stats: webpack.Stats) {
  for (const key of stats.compilation.entrypoints.keys()) {
    if (isMiddlewareFilename(key)) {
      return true
    }
  }

  return false
}

function statsToJson(stats?: webpack.Stats | null) {
  if (!stats) return {}
  return stats.toJson({
    all: false,
    errors: true,
    hash: true,
    warnings: true,
  })
}

function getStatsForSyncEvent(
  clientStats: { ts: number; stats: webpack.Stats } | null,
  serverStats: { ts: number; stats: webpack.Stats } | null
) {
  if (!clientStats) return serverStats?.stats
  if (!serverStats) return clientStats?.stats

  // Prefer the server compiler stats if it has errors.
  // Otherwise we may end up in a state where the client compilation is the latest but without errors.
  // This causes the error overlay to not display the build error.
  if (serverStats.stats.hasErrors()) {
    return serverStats.stats
  }

  // Return the latest stats
  return serverStats.ts > clientStats.ts ? serverStats.stats : clientStats.stats
}

class EventStream {
  clients: Set<ws>
  constructor() {
    this.clients = new Set()
  }

  close() {
    for (const wsClient of this.clients) {
      // it's okay to not cleanly close these websocket connections, this is dev
      wsClient.terminate()
    }
    this.clients.clear()
  }

  handler(client: ws) {
    this.clients.add(client)
    client.addEventListener('close', () => {
      this.clients.delete(client)
    })
  }

  publish(payload: any) {
    for (const wsClient of this.clients) {
      wsClient.send(JSON.stringify(payload))
    }
  }
}

export class WebpackHotMiddleware {
  eventStream: EventStream
  clientLatestStats: { ts: number; stats: webpack.Stats } | null
  middlewareLatestStats: { ts: number; stats: webpack.Stats } | null
  serverLatestStats: { ts: number; stats: webpack.Stats } | null
  closed: boolean
  versionInfo: VersionInfo
  devtoolsFrontendUrl: string | undefined

  constructor(
    compilers: webpack.Compiler[],
    versionInfo: VersionInfo,
    devtoolsFrontendUrl: string | undefined
  ) {
    this.eventStream = new EventStream()
    this.clientLatestStats = null
    this.middlewareLatestStats = null
    this.serverLatestStats = null
    this.closed = false
    this.versionInfo = versionInfo
    this.devtoolsFrontendUrl = devtoolsFrontendUrl

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
    compilers[2].hooks.done.tap('webpack-hot-middleware', this.onEdgeServerDone)
    compilers[2].hooks.invalid.tap(
      'webpack-hot-middleware',
      this.onEdgeServerInvalid
    )
  }

  onClientInvalid = () => {
    if (this.closed || this.serverLatestStats?.stats.hasErrors()) return
    this.publish({
      action: HMR_ACTIONS_SENT_TO_BROWSER.BUILDING,
    })
  }

  onClientDone = (statsResult: webpack.Stats) => {
    this.clientLatestStats = { ts: Date.now(), stats: statsResult }
    if (this.closed || this.serverLatestStats?.stats.hasErrors()) return
    this.publishStats(statsResult)
  }

  onServerInvalid = () => {
    if (!this.serverLatestStats?.stats.hasErrors()) return
    this.serverLatestStats = null
    if (this.clientLatestStats?.stats) {
      this.publishStats(this.clientLatestStats.stats)
    }
  }

  onServerDone = (statsResult: webpack.Stats) => {
    if (this.closed) return
    if (statsResult.hasErrors()) {
      this.serverLatestStats = { ts: Date.now(), stats: statsResult }
      this.publishStats(statsResult)
    }
  }

  onEdgeServerInvalid = () => {
    if (!this.middlewareLatestStats?.stats.hasErrors()) return
    this.middlewareLatestStats = null
    if (this.clientLatestStats?.stats) {
      this.publishStats(this.clientLatestStats.stats)
    }
  }

  onEdgeServerDone = (statsResult: webpack.Stats) => {
    if (!isMiddlewareStats(statsResult)) {
      this.onServerInvalid()
      this.onServerDone(statsResult)
      return
    }

    if (statsResult.hasErrors()) {
      this.middlewareLatestStats = { ts: Date.now(), stats: statsResult }
      this.publishStats(statsResult)
    }
  }

  /**
   * To sync we use the most recent stats but also we append middleware
   * errors. This is because it is possible that middleware fails to compile
   * and we still want to show the client overlay with the error while
   * the error page should be rendered just fine.
   */
  onHMR = (client: ws) => {
    if (this.closed) return
    this.eventStream.handler(client)

    const syncStats = getStatsForSyncEvent(
      this.clientLatestStats,
      this.serverLatestStats
    )

    if (syncStats) {
      const stats = statsToJson(syncStats)
      const middlewareStats = statsToJson(this.middlewareLatestStats?.stats)

      this.publish({
        action: HMR_ACTIONS_SENT_TO_BROWSER.SYNC,
        hash: stats.hash!,
        errors: [...(stats.errors || []), ...(middlewareStats.errors || [])],
        warnings: [
          ...(stats.warnings || []),
          ...(middlewareStats.warnings || []),
        ],
        versionInfo: this.versionInfo,
        debug: {
          devtoolsFrontendUrl: this.devtoolsFrontendUrl,
        },
      })
    }
  }

  publishStats = (statsResult: webpack.Stats) => {
    const stats = statsResult.toJson({
      all: false,
      hash: true,
      warnings: true,
      errors: true,
      moduleTrace: true,
    })

    this.publish({
      action: HMR_ACTIONS_SENT_TO_BROWSER.BUILT,
      hash: stats.hash!,
      warnings: stats.warnings || [],
      errors: stats.errors || [],
    })
  }

  publish = (payload: HMR_ACTION_TYPES) => {
    if (this.closed) return
    this.eventStream.publish(payload)
  }
  close = () => {
    if (this.closed) return
    // Can't remove compiler plugins, so we just set a flag and noop if closed
    // https://github.com/webpack/tapable/issues/32#issuecomment-350644466
    this.closed = true
    this.eventStream.close()
  }
}
