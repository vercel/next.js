// Runs the pre-compiled server in minimal mode in this process, the way a
// serverless function entry does: it loads the server, lets it handle one
// request and reports how the Node.js environment was set up along the way.
const http = require('http')
const Module = require('module')

process.env.NODE_ENV = 'production'

// Some of the globals that the Node.js environment setup replaces.
function readGlobals() {
  return {
    Date,
    'Math.random': Math.random,
    'crypto.randomUUID': crypto.randomUUID,
    'console.error': console.error,
    'Module._resolveFilename': Module._resolveFilename,
    'Module.prototype.require': Module.prototype.require,
  }
}

function getReplaced(before, after) {
  return Object.keys(after).filter((name) => before[name] !== after[name])
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
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}/api/ping`,
    {
      method: 'POST',
      headers: { 'x-matched-path': '/api/ping' },
    }
  )
  const body = await res.text()
  const afterRequest = readGlobals()

  const result = {
    status: res.status,
    body,
    replacedAtStartup: getReplaced(original, afterStartup),
    replacedByRequest: getReplaced(afterStartup, afterRequest),
    loadedSetupModules: Object.keys(require.cache)
      .map((id) => id.replace(/\\/g, '/'))
      .filter((id) =>
        /\/next\/dist\/server\/(node-environment|require-hook|node-polyfill-crypto)\.js$/.test(
          id
        )
      )
      .map((id) => id.slice(id.lastIndexOf('/next/dist/') + 1)),
  }

  process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0))
})
