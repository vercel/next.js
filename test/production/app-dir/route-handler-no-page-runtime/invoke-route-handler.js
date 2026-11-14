// Runs one route handler of the build output in this process the way a
// deployment adapter does: it sets up the Node.js environment, then loads the
// route module for the first request and calls its handler. It reports which
// app-page runtime files the process has loaded after that request.
const http = require('http')
const path = require('path')

process.env.NODE_ENV = 'production'

require('next/dist/build/adapter/setup-node-env.external')

const pathname = process.argv[2]

function fail(error) {
  console.error(error)
  process.exit(1)
}

const server = http.createServer((req, res) => {
  const { handler } = require(
    path.join(__dirname, '.next/server/app', pathname, 'route.js')
  )

  handler(req, res, {
    waitUntil: (promise) => promise.catch(fail),
    requestMeta: { minimalMode: true, relativeProjectDir: '.' },
  }).catch(fail)
})

server.listen(0, '127.0.0.1', async () => {
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}${pathname}`,
    { redirect: 'manual' }
  )
  await res.arrayBuffer()

  if (res.status >= 500) {
    fail(new Error(`${pathname} responded with status ${res.status}`))
  }

  const loadedPageRuntime = Object.keys(require.cache)
    .map((id) => id.replace(/\\/g, '/'))
    .filter((id) => /\/next-server\/app-page[^/]*\.runtime\.[^/]*$/.test(id))
    .map((id) => id.slice(id.lastIndexOf('/') + 1))

  process.stdout.write(JSON.stringify({ loadedPageRuntime }) + '\n', () =>
    process.exit(0)
  )
})
