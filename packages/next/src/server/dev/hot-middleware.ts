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
import { type webpack, StringXor } from 'next/dist/compiled/webpack/webpack'
import type ws from 'next/dist/compiled/ws'
import { difference, isMiddlewareFilename } from '../../build/utils'
import type { VersionInfo } from './parse-version-info'
import type { HMR_ACTION_TYPES } from './hot-reloader-types'
import { HMR_ACTIONS_SENT_TO_BROWSER } from './hot-reloader-types'
import { WEBPACK_LAYERS } from '../../lib/constants'
import { denormalizePagePath } from '../../shared/lib/page-path/denormalize-page-path'

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

  everyClient(fn: (client: ws) => void) {
    for (const client of this.clients) {
      fn(client)
    }
  }

  close() {
    this.everyClient((client) => {
      client.close()
    })
    this.clients.clear()
  }

  handler(client: ws) {
    this.clients.add(client)
    client.addEventListener('close', () => {
      this.clients.delete(client)
    })
  }

  publish(payload: any) {
    this.everyClient((client) => {
      client.send(JSON.stringify(payload))
    })
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
  pendingStats = []
  reloadAfterInvalidation?: boolean
  resetFetch: () => void

  constructor(
    multiCompiler: webpack.MultiCompiler,
    versionInfo: VersionInfo,
    devtoolsFrontendUrl: string | undefined,
    pageExtensions: string[],
    resetFetch: () => void
  ) {
    const compilers = multiCompiler.compilers
    this.eventStream = new EventStream()
    this.clientLatestStats = null
    this.middlewareLatestStats = null
    this.serverLatestStats = null
    this.closed = false
    this.versionInfo = versionInfo
    this.devtoolsFrontendUrl = devtoolsFrontendUrl
    this.pendingStats = []
    this.resetFetch = resetFetch

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
    // Watch for changes to client/server page files so we can tell when just
    // the server file changes and trigger a reload for GS(S)P pages
    const changedClientPages = new Set<string>()
    const changedServerPages = new Set<string>()
    const changedEdgeServerPages = new Set<string>()

    const changedServerComponentPages = new Set<string>()
    const changedCSSImportPages = new Set<string>()

    const prevClientPageHashes = new Map<string, string>()
    const prevServerPageHashes = new Map<string, string>()
    const prevEdgeServerPageHashes = new Map<string, string>()
    const prevCSSImportModuleHashes = new Map<string, string>()

    const pageExtensionRegex = new RegExp(`\\.(?:${pageExtensions.join('|')})$`)

    const trackPageChanges =
      (
        pageHashMap: Map<string, string>,
        changedItems: Set<string>,
        serverComponentChangedItems?: Set<string>
      ) =>
      (stats: webpack.Compilation) => {
        try {
          stats.entrypoints.forEach((entry, key) => {
            if (
              key.startsWith('pages/') ||
              key.startsWith('app/') ||
              isMiddlewareFilename(key)
            ) {
              // TODO this doesn't handle on demand loaded chunks
              entry.chunks.forEach((chunk) => {
                if (chunk.id === key) {
                  const modsIterable: any =
                    stats.chunkGraph.getChunkModulesIterable(chunk)

                  let hasCSSModuleChanges = false
                  let chunksHash = new StringXor()
                  let chunksHashServerLayer = new StringXor()

                  modsIterable.forEach((mod: any) => {
                    if (
                      mod.resource &&
                      mod.resource.replace(/\\/g, '/').includes(key) &&
                      // Shouldn't match CSS modules, etc.
                      pageExtensionRegex.test(mod.resource)
                    ) {
                      // use original source to calculate hash since mod.hash
                      // includes the source map in development which changes
                      // every time for both server and client so we calculate
                      // the hash without the source map for the page module
                      const hash = require('crypto')
                        .createHash('sha1')
                        .update(mod.originalSource().buffer())
                        .digest()
                        .toString('hex')

                      if (
                        mod.layer === WEBPACK_LAYERS.reactServerComponents &&
                        mod?.buildInfo?.rsc?.type !== 'client'
                      ) {
                        chunksHashServerLayer.add(hash)
                      }

                      chunksHash.add(hash)
                    } else {
                      // for non-pages we can use the module hash directly
                      const hash = stats.chunkGraph.getModuleHash(
                        mod,
                        chunk.runtime
                      )

                      if (
                        mod.layer === WEBPACK_LAYERS.reactServerComponents &&
                        mod?.buildInfo?.rsc?.type !== 'client'
                      ) {
                        chunksHashServerLayer.add(hash)
                      }

                      chunksHash.add(hash)

                      // Both CSS import changes from server and client
                      // components are tracked.
                      if (
                        key.startsWith('app/') &&
                        /\.(css|scss|sass)$/.test(mod.resource || '')
                      ) {
                        const resourceKey = mod.layer + ':' + mod.resource
                        const prevHash =
                          prevCSSImportModuleHashes.get(resourceKey)
                        if (prevHash && prevHash !== hash) {
                          hasCSSModuleChanges = true
                        }
                        prevCSSImportModuleHashes.set(resourceKey, hash)
                      }
                    }
                  })

                  const prevHash = pageHashMap.get(key)
                  const curHash = chunksHash.toString()
                  if (prevHash && prevHash !== curHash) {
                    changedItems.add(key)
                  }
                  pageHashMap.set(key, curHash)

                  if (serverComponentChangedItems) {
                    const serverKey =
                      WEBPACK_LAYERS.reactServerComponents + ':' + key
                    const prevServerHash = pageHashMap.get(serverKey)
                    const curServerHash = chunksHashServerLayer.toString()
                    if (prevServerHash && prevServerHash !== curServerHash) {
                      serverComponentChangedItems.add(key)
                    }
                    pageHashMap.set(serverKey, curServerHash)
                  }

                  if (hasCSSModuleChanges) {
                    changedCSSImportPages.add(key)
                  }
                }
              })
            }
          })
        } catch (err) {
          console.error(err)
        }
      }

    compilers[0].hooks.emit.tap(
      'NextjsHotReloaderForClient',
      trackPageChanges(prevClientPageHashes, changedClientPages)
    )
    compilers[1].hooks.emit.tap(
      'NextjsHotReloaderForServer',
      trackPageChanges(
        prevServerPageHashes,
        changedServerPages,
        changedServerComponentPages
      )
    )
    compilers[2].hooks.emit.tap(
      'NextjsHotReloaderForServer',
      trackPageChanges(
        prevEdgeServerPageHashes,
        changedEdgeServerPages,
        changedServerComponentPages
      )
    )
    let lastSentClientStats = 0
    let lastSentServerStats = 0

    multiCompiler.hooks.done.tap('NextjsHotReloaderForServer', () => {
      const reloadAfterInvalidation = this.reloadAfterInvalidation
      this.reloadAfterInvalidation = false

      if (
        this.clientLatestStats &&
        this.clientLatestStats.ts > lastSentClientStats
      ) {
        lastSentClientStats = Date.now()
        this.publishStats(this.clientLatestStats.stats)
      }
      if (
        this.serverLatestStats &&
        this.serverLatestStats.ts > lastSentServerStats
      ) {
        lastSentServerStats = Date.now()
        this.publishStats(this.serverLatestStats.stats)
      }
      const serverOnlyChanges = difference<string>(
        changedServerPages,
        changedClientPages
      )

      const edgeServerOnlyChanges = difference<string>(
        changedEdgeServerPages,
        changedClientPages
      )

      const pageChanges = serverOnlyChanges
        .concat(edgeServerOnlyChanges)
        .filter((key) => key.startsWith('pages/'))
      const middlewareChanges = Array.from(changedEdgeServerPages).filter(
        (name) => isMiddlewareFilename(name)
      )

      if (middlewareChanges.length > 0) {
        this.publish({
          event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
        })
      }

      if (pageChanges.length > 0) {
        this.publish({
          event: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES,
          pages: serverOnlyChanges.map((pg) =>
            denormalizePagePath(pg.slice('pages'.length))
          ),
        })
      }

      if (
        changedServerComponentPages.size ||
        changedCSSImportPages.size ||
        reloadAfterInvalidation
      ) {
        this.resetFetch()

        // This event must come after the stats have been sent above
        // or else the client might try to trigger the HMR RSC request
        // before we send built event clearing any errors that are still
        // valid from the HMR RSC request
        this.publish({
          action: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
          // TODO: granular reloading of changes
          // entrypoints: serverComponentChanges,
        })
      }

      changedClientPages.clear()
      changedServerPages.clear()
      changedEdgeServerPages.clear()
      changedServerComponentPages.clear()
      changedCSSImportPages.clear()
    })
  }

  onClientInvalid = () => {
    this.clientLatestStats = null
    if (this.closed || this.serverLatestStats?.stats.hasErrors()) return
    this.publish({
      action: HMR_ACTIONS_SENT_TO_BROWSER.BUILDING,
    })
  }

  onClientDone = (statsResult: webpack.Stats) => {
    this.clientLatestStats = { ts: Date.now(), stats: statsResult }
    if (this.closed || this.serverLatestStats?.stats.hasErrors()) return
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
