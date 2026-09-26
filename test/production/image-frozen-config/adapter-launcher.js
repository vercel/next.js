// Mimics how deployment platforms invoke a compiled route entry: the launcher
// requires the route's built module and calls its handler export directly.
// There is no NextServer, so no RouterServerContext is registered and the route
// module falls back to the deep-frozen config in `required-server-files.json`.
const http = require('http')
const path = require('path')

require('next/dist/build/adapter/setup-node-env.external')

const dir = process.cwd()
const port = Number(process.env.PORT)
const mod = require(path.join(dir, '.next/server/pages/index.js'))

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
