// Mimics how a deployment adapter runs a route: it requires the route's entry
// and calls its `handler` export with minimal-mode request metadata. The
// `x-test-entry` request header names the entry below `.next/server`.
const fs = require('fs')
const http = require('http')
const path = require('path')

const dir = process.cwd()
const port = Number(process.env.PORT)

// Record which prerender manifests this process reads.
const manifestReads = []
const readFileSync = fs.readFileSync
fs.readFileSync = function (file, ...args) {
  const content = readFileSync.call(this, file, ...args)
  if (typeof file === 'string' && file.endsWith('prerender-manifest.json')) {
    manifestReads.push(path.relative(dir, file).replace(/\\/g, '/'))
  }
  return content
}

require('next/dist/build/adapter/setup-node-env.external')

http
  .createServer((req, res) => {
    if (req.url === '/__manifest-reads') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(manifestReads))
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
  .listen(port, () => console.log('adapter launcher ready'))
