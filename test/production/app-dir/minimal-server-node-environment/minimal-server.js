// Runs the pre-compiled server in minimal mode in this process, the way a
// serverless function entry does: it loads the server, lets it handle two
// requests and reports how the Node.js environment was set up along the way.
const http = require('http')
const Module = require('module')

process.env.NODE_ENV = 'production'

// Globals that the Node.js environment setup replaces once. The console
// methods are not among them: see the second test.
function readGlobals() {
  return {
    Date,
    'Math.random': Math.random,
    'crypto.randomUUID': crypto.randomUUID,
    'Module._resolveFilename': Module._resolveFilename,
    'Module.prototype.require': Module.prototype.require,
  }
}

const original = readGlobals()

const NextServer =
  require('next/dist/compiled/next-server/server.runtime.prod.js').default
const { config } = require('./.next/required-server-files.json')

const handler = new NextServer({
  conf: config,
  dir: __dirname,
  minimalMode: true,
  customServer: false,
}).getRequestHandler()

const afterStartup = readGlobals()

const server = http.createServer(handler)
server.listen(0, '127.0.0.1', async () => {
  const origin = `http://127.0.0.1:${server.address().port}`

  const res = await fetch(`${origin}/api/ping`, {
    method: 'POST',
    headers: { 'x-matched-path': '/api/ping' },
  })
  const body = await res.text()
  const afterRequest = readGlobals()

  // A page that logs while it renders. The request has a time limit so that a
  // render that never finishes is reported instead of blocking the test.
  const pageStatus = await fetch(`${origin}/logged`, {
    headers: { 'x-matched-path': '/logged' },
    signal: AbortSignal.timeout(20_000),
  }).then(
    async (pageRes) => {
      await pageRes.text()
      return pageRes.status
    },
    (err) => `no response (${err.name})`
  )

  const replacedAtStartup = Object.keys(original).filter(
    (name) => original[name] !== afterStartup[name]
  )

  const result = {
    status: res.status,
    body,
    replacedAtStartup,
    replacedAgainByRequest: replacedAtStartup.filter(
      (name) => afterStartup[name] !== afterRequest[name]
    ),
    loadedSetupModules: Object.keys(require.cache)
      .map((id) => id.replace(/\\/g, '/'))
      .filter((id) =>
        /\/next\/dist\/server\/(node-environment|require-hook|node-polyfill-crypto)\.js$/.test(
          id
        )
      )
      .map((id) => id.slice(id.lastIndexOf('/next/dist/') + 1)),
    pageStatus,
    instrumentedLogCalls: globalThis.__instrumentedLogCalls,
  }

  process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0))
})
