// Runs a built route handler in this process the way a deployment adapter
// does: it sets up the Node.js environment, requires the entrypoint of the
// route and calls its `handler` with one request. It reports the `next/dist`
// files that the route loaded on top of the environment, which of them are
// modules that the loaded runtime bundles contain as well, and the modules
// that import those.
const fs = require('fs')
const http = require('http')
const path = require('path')

process.env.NODE_ENV = 'production'

require('next/dist/build/adapter/setup-node-env.external')
const loadedByEnvironment = new Set(Object.keys(require.cache))

const server = http.createServer((req, res) => {
  const { handler } = require('./.next/server/app/api/ping/route.js')
  handler(req, res, { requestMeta: { minimalMode: true } }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
})

server.listen(0, '127.0.0.1', async () => {
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}/api/ping`,
    {
      method: 'POST',
      headers: { 'x-matched-path': '/api/ping' },
    }
  )
  const body = await res.text()

  const loaded = new Map()
  for (const file of Object.keys(require.cache)) {
    const id = file.replace(/\\/g, '/')
    if (!loadedByEnvironment.has(file) && id.includes('/next/dist/')) {
      loaded.set(id.slice(id.lastIndexOf('/next/dist/') + 1), file)
    }
  }

  // The source map of a runtime bundle lists the modules that it contains.
  const runtimes = []
  const bundled = new Set()
  for (const [id, file] of loaded) {
    if (/^next\/dist\/compiled\/next-server\/.+\.runtime\.prod\.js$/.test(id)) {
      runtimes.push(id)
      const { sources } = JSON.parse(fs.readFileSync(file + '.map', 'utf8'))
      for (const source of sources) {
        const match = /\/src\/(.+)\.tsx?$/.exec(source)
        if (match) bundled.add(`next/dist/${match[1]}.js`)
      }
    }
  }

  const loadedTwice = [...loaded.keys()].filter((id) => bundled.has(id)).sort()

  // A module lists every module that it requires in its `children`. An
  // importer outside of `next/dist` is named by its path in the application.
  const importers = {}
  for (const id of loadedTwice) {
    importers[id] = Object.values(require.cache)
      .filter((mod) =>
        mod.children.some((child) => child.filename === loaded.get(id))
      )
      .map((mod) => {
        const file = mod.filename.replace(/\\/g, '/')
        return file.includes('/next/dist/')
          ? file.slice(file.lastIndexOf('/next/dist/') + 1)
          : path.relative(__dirname, mod.filename)
      })
      .sort()
  }

  const result = {
    status: res.status,
    body,
    runtimes,
    bundled: [...bundled].sort(),
    loaded: [...loaded.keys()].sort(),
    loadedTwice,
    importers,
  }

  process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0))
})
