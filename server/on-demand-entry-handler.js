import DynamicEntryPlugin from 'webpack/lib/DynamicEntryPlugin'
import { EventEmitter } from 'events'

export default function onDemandEntryHandler (devMiddleware, compiler, { dir, dev }) {
  // TODO: Make this a LRU cache
  const entries = {}
  let doingEntries = {}
  let completedEntries = {}

  const doneCallbacks = new EventEmitter()

  compiler.plugin('make', function (compilation, done) {
    const allEntries = Object.keys(entries).map((name) => {
      doingEntries[name] = true
      const entry = entries[name]
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
    ensureEntry (name, entry) {
      return new Promise((resolve, reject) => {
        if (completedEntries[name]) {
          return resolve()
        }

        if (entries[name]) {
          doneCallbacks.on(name, processCallback)
          return
        }

        entries[name] = entry
        doneCallbacks.on(name, processCallback)

        devMiddleware.invalidate()

        function processCallback (err) {
          if (err) return reject(err)
          resolve()
        }
      })
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
