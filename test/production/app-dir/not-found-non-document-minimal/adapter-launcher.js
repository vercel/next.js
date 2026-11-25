// Mimics how deployment platforms invoke the compiled not-found route entry:
// the adapter launcher requires the route's page.js and calls its handler
// export with minimal-mode request metadata.
const http = require('http')
const path = require('path')

require('next/dist/build/adapter/setup-node-env.external')

const dir = process.cwd()
const port = Number(process.env.PORT)
const mod = require(path.join(dir, '.next/server/app/_not-found/page.js'))

http
  .createServer((req, res) => {
    Promise.resolve(
      mod.handler(req, res, {
        waitUntil: undefined,
        requestMeta: {
          minimalMode: true,
          relativeProjectDir: '.',
          initURL: `https://localhost${req.url}`,
        },
      })
    ).catch((err) => {
      console.error('handler error', err)
      if (!res.writableEnded) {
        res.statusCode = 500
        res.end('internal error')
      }
    })
  })
  .listen(port, () => console.log('adapter launcher ready'))
