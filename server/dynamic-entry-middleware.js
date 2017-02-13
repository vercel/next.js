import DynamicEntryPlugin from 'webpack/lib/DynamicEntryPlugin'
import { EventEmitter } from 'events'

export default function dynamicEntryMiddleware (devMiddleware, compiler, { dir, dev }) {
  // TODO: Make this a LRU cache
  const entries = {}
  let doingEntries = {}
  let completedEntries = {}

  const doneCallbacks = new EventEmitter()

  compiler.plugin('make', function (compilation, done) {
    const allEntries = Object.keys(entries).map((name) => {
      doingEntries[name] = true
      const entry = entries[name]
      return addEntry(compilation, name, entry)
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

  // Add the entries to the map and invalidate
  // Set the next to nextCallbacks
  return function (req, res, next) {
    if (req.method !== 'POST') return next()
    if (req.url !== '/webpack-config/add_entry') return next()

    reqToData(req, (err, data) => {
      if (err) {
        console.error(err.stack)
        res.statusCode = 500
        res.end('Internal Error')
        return
      }

      if (completedEntries[data.name]) {
        next()
        return
      }

      if (entries[data.name]) {
        doneCallbacks.on(data.name, next)
        return
      }

      entries[data.name] = data.entry
      doneCallbacks.on(data.name, next)

      devMiddleware.invalidate()
    })
  }
}

function addEntry (compilation, name, entry) {
  return new Promise((resolve, reject) => {
    const dep = DynamicEntryPlugin.createDependency(entry, name)
    compilation.addEntry(this.context, dep, name, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
}

function reqToData (req, cb) {
  if (req.data) return cb(null, req.data)

  let jsonString = ''
  req.on('data', (data) => {
    jsonString += data.toString()
  })
  req.on('end', () => cb(null, JSON.parse(jsonString)))
  req.on('error', (err) => cb(err))
}
