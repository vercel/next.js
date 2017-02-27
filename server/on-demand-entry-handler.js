import DynamicEntryPlugin from 'webpack/lib/DynamicEntryPlugin'
import { EventEmitter } from 'events'
import { join } from 'path'
import { parse } from 'url'
import resolvePath from './resolve'
import touch from 'touch'

const ADDED = Symbol()
const BUILDING = Symbol()
const BUILT = Symbol()

export default function onDemandEntryHandler (devMiddleware, compiler, {
  dir,
  dev,
  maxInactiveAge = 1000 * 25
}) {
  const entries = {}
  const lastAccessPages = ['']
  const doneCallbacks = new EventEmitter()
  const invalidator = new Invalidator(devMiddleware)
  let touchedAPage = false

  compiler.plugin('make', function (compilation, done) {
    invalidator.startBuilding()

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

    invalidator.doneBuilding()
  })

  setInterval(function () {
    disposeInactiveEntries(devMiddleware, entries, lastAccessPages, maxInactiveAge)
  }, 5000)

  return {
    async ensurePage (page) {
      page = normalizePage(page)

      const pagePath = join(dir, 'pages', page)
      const pathname = await resolvePath(pagePath)
      const name = join('bundles', pathname.substring(dir.length))

      const entry = [
        join(__dirname, '..', 'client/webpack-hot-middleware-client'),
        join(__dirname, '..', 'client', 'on-demand-entries-client'),
        `${pathname}?entry`
      ]

      await new Promise((resolve, reject) => {
        const entryInfo = entries[page]

        if (entryInfo) {
          if (entryInfo.status === BUILT) {
            resolve()
            return
          }

          if (entryInfo.status === BUILDING) {
            doneCallbacks.on(page, processCallback)
            return
          }
        }

        console.log(`> Building page: ${page}`)

        entries[page] = { name, entry, pathname, status: ADDED }
        doneCallbacks.on(page, processCallback)

        invalidator.invalidate()

        function processCallback (err) {
          if (err) return reject(err)
          resolve()
        }
      })
    },

    middleware () {
      return function (req, res, next) {
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
        lastAccessPages.pop()
        lastAccessPages.unshift(page)
        entryInfo.lastActiveTime = Date.now()
      }
    }
  }
}

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
    if (lastAccessPages[0] === page) return

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
