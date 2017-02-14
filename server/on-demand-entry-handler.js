import DynamicEntryPlugin from 'webpack/lib/DynamicEntryPlugin'
import { EventEmitter } from 'events'
import { join } from 'path'
import { parse } from 'url'
import resolvePath from './resolve'

export default function onDemandEntryHandler (devMiddleware, compiler, { dir, dev }) {
  const entries = {}
  let doingEntries = {}
  let completedEntries = {}

  const doneCallbacks = new EventEmitter()

  compiler.plugin('make', function (compilation, done) {
    const allEntries = Object.keys(entries).map((page) => {
      console.log('XXXXXX', page)
      const { name, entry } = entries[page]
      doingEntries[page] = true
      return addEntry(compilation, this.context, name, entry)
    })

    Promise.all(allEntries)
      .then(() => done())
      .catch(done)

    console.log('MAKE')
  })

  compiler.plugin('done', function (stats) {
    // Call all the doneCallbacks
    Object.keys(doingEntries).forEach((name) => {
      doneCallbacks.emit(name)
    })

    completedEntries = doingEntries
    doingEntries = {}

    console.log('DONE')
  })

  return {
    async ensurePage (page) {
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
        console.log(`Hit: ${query.page}`)
        res.status = 200
        res.end('Success')
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
