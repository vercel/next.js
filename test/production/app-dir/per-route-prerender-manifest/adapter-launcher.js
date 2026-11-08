// Mimics how a deployment adapter runs a route: it requires the route's entry
// and calls its `handler` export with minimal-mode request metadata. The
// `x-test-entry` request header names the entry below `.next/server`. The
// working directory is the function: a project directory with a `.next`.
//
// With `TEST_SERVER=1` it runs the whole application as a custom server
// instead, to record what a long-running server reads.
const fs = require('fs')
const http = require('http')
const path = require('path')

const dir = process.cwd()
const port = Number(process.env.PORT)

// Record which prerender manifests this process reads. A read that fails is
// recorded with a leading `!`.
const manifestReads = []
const readFileSync = fs.readFileSync
fs.readFileSync = function (file, ...args) {
  const isManifest =
    typeof file === 'string' && file.endsWith('prerender-manifest.json')
  const name = isManifest ? path.relative(dir, file).replace(/\\/g, '/') : ''
  try {
    const content = readFileSync.call(this, file, ...args)
    if (isManifest) manifestReads.push(name)
    return content
  } catch (err) {
    if (isManifest) manifestReads.push(`!${name}`)
    throw err
  }
}

require('next/dist/build/adapter/setup-node-env.external')

function sendManifestReads(res) {
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(manifestReads))
}

function ready() {
  console.log('adapter launcher ready')
}

if (process.env.TEST_SERVER) {
  const app = require('next')({ dev: false, dir })
  const handle = app.getRequestHandler()
  app.prepare().then(() => {
    http
      .createServer((req, res) =>
        req.url === '/__manifest-reads'
          ? sendManifestReads(res)
          : handle(req, res)
      )
      .listen(port, ready)
  })
} else {
  // A route asks the launcher to render the not-found page, which is another
  // entry of the same function.
  const routerServerMethods = Symbol.for('@next/router-server-methods')
  globalThis[routerServerMethods] ||= {}
  globalThis[routerServerMethods]['.'] = {
    async render404(req, res) {
      let mod
      for (const entry of [
        'app/_not-found/page',
        'pages/404',
        'pages/_error',
      ]) {
        const file = path.join(dir, '.next/server', `${entry}.js`)
        if (fs.existsSync(file)) {
          mod = require(file)
          break
        }
      }
      res.statusCode = 404
      await mod.handler(req, res, { waitUntil: undefined })
    },
  }

  http
    .createServer((req, res) => {
      if (req.url === '/__manifest-reads') {
        sendManifestReads(res)
        return
      }

      const entry = req.headers['x-test-entry']
      delete req.headers['x-test-entry']

      Promise.resolve()
        .then(() => {
          const mod = require(path.join(dir, '.next/server', `${entry}.js`))
          return mod.handler(req, res, {
            waitUntil: undefined,
            requestMeta: {
              minimalMode: true,
              relativeProjectDir: '.',
              initURL: `https://localhost${req.url}`,
            },
          })
        })
        .catch((err) => {
          console.error('handler error', err)
          if (!res.writableEnded) {
            res.statusCode = 500
            res.end('internal error')
          }
        })
    })
    .listen(port, ready)
}
