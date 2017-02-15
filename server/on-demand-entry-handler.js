import DynamicEntryPlugin from 'webpack/lib/DynamicEntryPlugin'
import { EventEmitter } from 'events'
import { join } from 'path'
import { parse } from 'url'
import resolvePath from './resolve'

export default function onDemandEntryHandler (devMiddleware, compiler, {
  dir,
  dev,
  maxInactiveAge = 1000 * 25
}) {
  const entries = {}
  let buildingEntries = {}
  let completedEntries = {}

  const doneCallbacks = new EventEmitter()

  compiler.plugin('make', function (compilation, done) {
    const allEntries = Object.keys(entries).map((page) => {
      const { name, entry } = entries[page]
      buildingEntries[page] = true
      return addEntry(compilation, this.context, name, entry)
    })

    Promise.all(allEntries)
      .then(() => done())
      .catch(done)
  })

  compiler.plugin('done', function (stats) {
    // Call all the doneCallbacks
    Object.keys(buildingEntries).forEach((page) => {
      entries[page].lastActiveTime = Date.now()
      doneCallbacks.emit(page)
    })

    completedEntries = buildingEntries
    buildingEntries = {}
  })

  setInterval(function () {
    disposeInactiveEntries(devMiddleware, entries, maxInactiveAge)
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
        if (completedEntries[page]) {
          return resolve()
        }

        if (entries[page]) {
          doneCallbacks.on(page, processCallback)
          return
        }

        console.log(`> Building page: ${page}`)

        entries[page] = { name, entry }
        doneCallbacks.on(page, processCallback)

        devMiddleware.invalidate()

        function processCallback (err) {
          if (err) return reject(err)
          resolve()
        }
      })
    },

    middleware () {
      return function (req, res, next) {
        if (!/^\/on-demand-entries-ping/.test(req.url)) return next()

        const { query } = parse(req.url, true)
        const page = normalizePage(query.page)
        const entry = entries[page]

        // We don't need to maintain active state for currently building entries
        if (buildingEntries[page]) return

        // If there's an entry
        if (entry) {
          entry.lastActiveTime = Date.now()
          res.status = 200
          res.end('Success')
          return
        }

        // If there's no entry.
        // Then it seems like an weird issue.
        const message = `Client pings, but there's no entry for page: ${page}`
        console.error(message)
        res.status = 500
        res.end(message)
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

function disposeInactiveEntries (devMiddleware, entries, maxInactiveAge) {
  const disposingPages = []

  Object.keys(entries).forEach((page) => {
    const { lastActiveTime } = entries[page]

    // This means this entry is currently building
    // We don't need to dispose those entries.
    if (!lastActiveTime) return

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
