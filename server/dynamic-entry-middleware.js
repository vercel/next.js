export default function dynamicEntryMiddleware (devMiddleware, compiler) {
  // LRU cache
  const entries = []
  let makeCallbacks = []
  let doneCallbacks = []

  // Based on the http request to add an entry. Add it and invalidate.
  setInterval(function () {
    devMiddleware.invalidate()
  }, 5000)

  compiler.plugin('make', function (compilation, done) {
    entries.forEach(() => null)
    console.log('Adding entries...')
    // Add all entries and move makeCallbacks to doneCallbacks
    doneCallbacks = [
      ...doneCallbacks,
      ...makeCallbacks
    ]
    makeCallbacks = []
    done()
  })

  compiler.plugin('done', function (stats, done) {
    // Call all the doneCallbacks
    doneCallbacks.forEach((fn) => fn())
    done()
    console.log('Done!')
  })

  // Add the entries to the map and invalidate
  // Set the next to nextCallbacks
  return function (req, res, next) {
    console.log('req', req.url)
    next()
  }
}
