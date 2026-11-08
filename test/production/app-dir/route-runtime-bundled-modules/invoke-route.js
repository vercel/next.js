// Runs a built route handler in this process the way a deployment adapter
// does: it sets up the Node.js environment, requires the entrypoint of the
// route and calls its `handler` with one request. It reports the files that
// the process loaded, which of them the environment setup loaded, the modules
// that the loaded runtime bundles contain, and for every loaded file the
// modules that it imports from separate files although a loaded runtime
// bundle contains them as well.
const fs = require('fs')
const http = require('http')
const path = require('path')

process.env.NODE_ENV = 'production'

require('next/dist/build/adapter/setup-node-env.external')
const loadedByEnvironment = Object.keys(require.cache)

const server = http.createServer((req, res) => {
  const { handler } = require('./.next/server/app/api/ping/route.js')
  handler(req, res, { requestMeta: { minimalMode: true } }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
})

// A file of `next/dist` is named from there, any other file by its path in
// the application.
function nameOf(file) {
  const id = file.replace(/\\/g, '/')
  return id.includes('/next/dist/')
    ? id.slice(id.lastIndexOf('/next/dist/') + 1)
    : path.relative(__dirname, file).replace(/\\/g, '/')
}

server.listen(0, '127.0.0.1', async () => {
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}/api/ping`,
    {
      method: 'POST',
      headers: { 'x-matched-path': '/api/ping' },
    }
  )
  const body = await res.text()

  const modules = Object.values(require.cache)

  // The source map of a runtime bundle lists the modules that it contains.
  const runtimes = []
  const bundled = new Set()
  for (const { filename } of modules) {
    const id = nameOf(filename)
    if (/^next\/dist\/compiled\/next-server\/.+\.runtime\.prod\.js$/.test(id)) {
      runtimes.push(id)
      const { sources } = JSON.parse(fs.readFileSync(filename + '.map', 'utf8'))
      for (const source of sources) {
        const match = /\/src\/(.+)\.tsx?$/.exec(source)
        if (match) bundled.add(`next/dist/${match[1]}.js`)
      }
    }
  }

  // A module lists every module that it requires in its `children`.
  const loadedTwice = {}
  for (const { filename, children } of modules) {
    const ids = children
      .map((child) => nameOf(child.filename))
      .filter((id) => bundled.has(id))
      .sort()
    if (ids.length > 0) loadedTwice[nameOf(filename)] = ids
  }

  const result = {
    status: res.status,
    body,
    runtimes,
    bundled: [...bundled].sort(),
    environment: loadedByEnvironment.map(nameOf).sort(),
    loaded: modules.map(({ filename }) => nameOf(filename)).sort(),
    loadedTwice,
  }

  process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0))
})
