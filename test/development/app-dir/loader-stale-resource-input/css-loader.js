// A pass-through CSS loader that behaves like loaders which cache their output
// by the resource's modification time (e.g. `@tailwindcss/turbopack`).
//
// For every invocation it records the source it was given, the content of the
// resource on disk and its mtime, so the test can detect invocations that run
// with stale input. The resource is read and stat'ed through `this.fs`, which
// reports the read and the stat to the bundler in addition to the dependency
// the loader runner adds for it.
const fs = require('fs')
const path = require('path')

const cache = new Map()

module.exports = function cssLoader(source) {
  const callback = this.async()
  const resourcePath = this.resourcePath
  // Kept in the dist dir so writing it doesn't trigger the file watcher.
  const logDir = path.join(this.rootContext, '.next')
  const logFile = path.join(logDir, 'loader-invocations.log')
  const depPath = path.join(path.dirname(resourcePath), 'dep.txt')

  this.fs.readFile(resourcePath, (err, data) => {
    if (err) return callback(err)
    const disk = data.toString('utf8')

    // Reported dependency: edits to it must still invalidate this loader.
    this.addDependency(depPath)
    const dep = fs.readFileSync(depPath, 'utf8').trim()

    this.fs.stat(resourcePath, (statErr, stats) => {
      if (statErr) return callback(statErr)
      const { mtimeMs } = stats
      fs.mkdirSync(logDir, { recursive: true })
      fs.appendFileSync(
        logFile,
        JSON.stringify({ source, disk, mtimeMs, stale: source !== disk }) + '\n'
      )

      let output
      const cached = cache.get(resourcePath)
      if (cached && cached.mtimeMs === mtimeMs) {
        output = cached.output
      } else {
        output = source
        cache.set(resourcePath, { mtimeMs, output })
      }

      callback(null, `${output}\n.dep::after { content: "${dep}"; }\n`)
    })
  })
}
