import { join } from 'path'
import DynamicEntryPlugin from 'webpack/lib/DynamicEntryPlugin'

export default function dynamicEntryMiddleware (devMiddleware, compiler, { dir, dev }) {
  // LRU cache
  const entries = []
  let makeCallbacks = []
  let doneCallbacks = []

  // Based on the http request to add an entry. Add it and invalidate.
  setInterval(function () {
    devMiddleware.invalidate()
  }, 5000)

  const defaultEntries = dev === 'development'
    ? [join(__dirname, '..', 'client/webpack-hot-middleware-client.js')] : []

  compiler.plugin('make', function (compilation, done) {
    entries.forEach(() => null)

    const entry = [
      ...defaultEntries,
      join(dir, 'pages', 'index.js?entry')
    ]

    const name = 'bundles/pages/index.js'

    compilation.addEntry(this.context, DynamicEntryPlugin.createDependency(entry, name), name, done)
    console.log('Adding entries...')
    compilation
    // Add all entries and move makeCallbacks to doneCallbacks
    doneCallbacks = [
      ...doneCallbacks,
      ...makeCallbacks
    ]
    makeCallbacks = []
    // done()
  })

  compiler.plugin('done', function (stats) {
    // Call all the doneCallbacks
    doneCallbacks.forEach((fn) => fn())
    console.log('Done!')
  })

  // Add the entries to the map and invalidate
  // Set the next to nextCallbacks
  return function (req, res, next) {
    console.log('req', req.url)
    next()
  }
}
