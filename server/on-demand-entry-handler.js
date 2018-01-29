import DynamicEntryPlugin from 'webpack/lib/DynamicEntryPlugin'
import { EventEmitter } from 'events'
import { join, relative } from 'path'
import { parse } from 'url'
import touch from 'touch'
import resolvePath from './resolve'
import {createEntry} from './build/webpack/utils'
import { MATCH_ROUTE_NAME, IS_BUNDLED_PAGE } from './utils'

const ADDED = Symbol('added')
const BUILDING = Symbol('building')
const BUILT = Symbol('built')

export default function onDemandEntryHandler (devMiddleware, compilers, {
  dir,
  dev,
  reload,
  maxInactiveAge = 1000 * 60,
  pagesBufferLength = 2
}) {
  let entries = {}
  let lastAccessPages = ['']
  let doneCallbacks = new EventEmitter()
  const invalidator = new Invalidator(devMiddleware)
  let touchedAPage = false
  let reloading = false
  let stopped = false
  let reloadCallbacks = new EventEmitter()
  // Keep the names of compilers which are building pages at a given moment.
  const currentBuilders = new Set()

  compilers.forEach(compiler => {
    compiler.plugin('make', function (compilation, done) {
      invalidator.startBuilding()
      currentBuilders.add(compiler.name)

      const allEntries = Object.keys(entries).map((page) => {
        const { name, entry } = entries[page]
        entries[page].status = BUILDING
        return addEntry(compilation, this.context, name, entry)
      })

      Promise.all(allEntries)
        .then(() => done())
        .catch(done)
    })

    compiler.plugin('done', function (stats) {
      // Wait until all the compilers mark the build as done.
      currentBuilders.delete(compiler.name)
      if (currentBuilders.size !== 0) return

      const { compilation } = stats
      const hardFailedPages = compilation.errors
        .filter(e => {
          // Make sure to only pick errors which marked with missing modules
          const hasNoModuleFoundError = /ENOENT/.test(e.message) || /Module not found/.test(e.message)
          if (!hasNoModuleFoundError) return false

          // The page itself is missing. So this is a failed page.
          if (IS_BUNDLED_PAGE.test(e.module.name)) return true

          // No dependencies means this is a top level page.
          // So this is a failed page.
          return e.module.dependencies.length === 0
        })
        .map(e => e.module.chunks)
        .reduce((a, b) => [...a, ...b], [])
        .map(c => {
          const pageName = MATCH_ROUTE_NAME.exec(c.name)[1]
          return normalizePage(`/${pageName}`)
        })

      // Call all the doneCallbacks
      Object.keys(entries).forEach((page) => {
        const entryInfo = entries[page]
        if (entryInfo.status !== BUILDING) return

        // With this, we are triggering a filesystem based watch trigger
        // It'll memorize some timestamp related info related to common files used
        // in the page
        // That'll reduce the page building time significantly.
        if (!touchedAPage) {
          setTimeout(() => {
            touch.sync(entryInfo.pathname)
          }, 1000)
          touchedAPage = true
        }

        entryInfo.status = BUILT
        entries[page].lastActiveTime = Date.now()
        doneCallbacks.emit(page)
      })

      invalidator.doneBuilding(compiler.name)

      if (hardFailedPages.length > 0 && !reloading) {
        console.log(`> Reloading webpack due to inconsistant state of pages(s): ${hardFailedPages.join(', ')}`)
        reloading = true
        reload()
          .then(() => {
            console.log('> Webpack reloaded.')
            reloadCallbacks.emit('done')
            stop()
          })
          .catch(err => {
            console.error(`> Webpack reloading failed: ${err.message}`)
            console.error(err.stack)
            process.exit(1)
          })
      }
    })
  })

  const disposeHandler = setInterval(function () {
    if (stopped) return
    disposeInactiveEntries(devMiddleware, entries, lastAccessPages, maxInactiveAge)
  }, 5000)

  function stop () {
    clearInterval(disposeHandler)
    stopped = true
    doneCallbacks = null
    reloadCallbacks = null
  }

  return {
    waitUntilReloaded () {
      if (!reloading) return Promise.resolve(true)
      return new Promise((resolve) => {
        reloadCallbacks.once('done', function () {
          resolve()
        })
      })
    },

    async ensurePage (page) {
      await this.waitUntilReloaded()
      page = normalizePage(page)

      const pagePath = join(dir, 'pages', page)
      const pathname = await resolvePath(pagePath)
      const {name, files} = createEntry(relative(dir, pathname))

      await new Promise((resolve, reject) => {
        const entryInfo = entries[page]

        if (entryInfo) {
          if (entryInfo.status === BUILT) {
            resolve()
            return
          }

          if (entryInfo.status === BUILDING) {
            doneCallbacks.once(page, handleCallback)
            return
          }
        }

        console.log(`> Building page: ${page}`)

        entries[page] = { name, entry: files, pathname, status: ADDED }
        doneCallbacks.once(page, handleCallback)

        invalidator.invalidate()

        function handleCallback (err) {
          if (err) return reject(err)
          resolve()
        }
      })
    },

    middleware () {
      return (req, res, next) => {
        if (stopped) {
          // If this handler is stopped, we need to reload the user's browser.
          // So the user could connect to the actually running handler.
          res.statusCode = 302
          res.setHeader('Location', req.url)
          res.end('302')
        } else if (reloading) {
          // Webpack config is reloading. So, we need to wait until it's done and
          // reload user's browser.
          // So the user could connect to the new handler and webpack setup.
          this.waitUntilReloaded()
            .then(() => {
              res.statusCode = 302
              res.setHeader('Location', req.url)
              res.end('302')
            })
        } else {
          if (!/^\/_next\/on-demand-entries-ping/.test(req.url)) return next()

          const { query } = parse(req.url, true)
          const page = normalizePage(query.page)
          const entryInfo = entries[page]

          // If there's no entry.
          // Then it seems like an weird issue.
          if (!entryInfo) {
            const message = `Client pings, but there's no entry for page: ${page}`
            console.error(message)
            sendJson(res, { invalid: true })
            return
          }

          sendJson(res, { success: true })

          // We don't need to maintain active state of anything other than BUILT entries
          if (entryInfo.status !== BUILT) return

          // If there's an entryInfo
          if (!lastAccessPages.includes(page)) {
            lastAccessPages.unshift(page)

            // Maintain the buffer max length
            if (lastAccessPages.length > pagesBufferLength) lastAccessPages.pop()
          }
          entryInfo.lastActiveTime = Date.now()
        }
      }
    }
  }
}

// Based on https://github.com/webpack/webpack/blob/master/lib/DynamicEntryPlugin.js#L29-L37
function addEntry (compilation, context, name, entry) {
  return new Promise((resolve, reject) => {
    const dep = DynamicEntryPlugin.createDependency(entry, name)
    compilation.addEntry(context, dep, name, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function disposeInactiveEntries (devMiddleware, entries, lastAccessPages, maxInactiveAge) {
  const disposingPages = []

  Object.keys(entries).forEach((page) => {
    const { lastActiveTime, status } = entries[page]

    // This means this entry is currently building or just added
    // We don't need to dispose those entries.
    if (status !== BUILT) return

    // We should not build the last accessed page even we didn't get any pings
    // Sometimes, it's possible our XHR ping to wait before completing other requests.
    // In that case, we should not dispose the current viewing page
    if (lastAccessPages.includes(page)) return

    if (Date.now() - lastActiveTime > maxInactiveAge) {
      disposingPages.push(page)
    }
  })

  if (disposingPages.length > 0) {
    disposingPages.forEach((page) => {
      delete entries[page]
    })
    console.log(`> Disposing inactive page(s): ${disposingPages.join(', ')}`)
    devMiddleware.invalidate()
  }
}

// /index and / is the same. So, we need to identify both pages as the same.
// This also applies to sub pages as well.
function normalizePage (page) {
  return page.replace(/\/index$/, '/')
}

function sendJson (res, payload) {
  res.setHeader('Content-Type', 'application/json')
  res.status = 200
  res.end(JSON.stringify(payload))
}

// Make sure only one invalidation happens at a time
// Otherwise, webpack hash gets changed and it'll force the client to reload.
class Invalidator {
  constructor (devMiddleware) {
    this.devMiddleware = devMiddleware
    // contains an array of types of compilers currently building
    this.building = false
    this.rebuildAgain = false
  }

  invalidate () {
    // If there's a current build is processing, we won't abort it by invalidating.
    // (If aborted, it'll cause a client side hard reload)
    // But let it to invalidate just after the completion.
    // So, it can re-build the queued pages at once.
    if (this.building) {
      this.rebuildAgain = true
      return
    }

    this.building = true
    this.devMiddleware.invalidate()
  }

  startBuilding () {
    this.building = true
  }

  doneBuilding () {
    this.building = false

    if (this.rebuildAgain) {
      this.rebuildAgain = false
      this.invalidate()
    }
  }
}
