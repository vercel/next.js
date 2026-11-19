// This launcher invokes compiled page handlers as a platform would. The test
// supplies the matched source route and calls its handler in minimal mode.
const http = require('node:http')
const fs = require('node:fs')

require('next/dist/build/adapter/setup-node-env.external')

const { outputs } = JSON.parse(fs.readFileSync('build-complete.json', 'utf8'))
const handlers = new Map(
  outputs.appPages.map((output) => [output.pathname, require(output.filePath)])
)

http
  .createServer((req, res) => {
    const mod = handlers.get(req.headers['x-matched-path'])
    if (!mod) {
      res.statusCode = 404
      res.end('unknown source route')
      return
    }
    Promise.resolve(
      mod.handler(req, res, {
        requestMeta: {
          minimalMode: true,
          relativeProjectDir: '.',
          initURL: `http://${req.headers.host}${req.url}`,
        },
      })
    ).catch((error) => {
      console.error(error)
      if (!res.writableEnded) {
        res.statusCode = 500
        res.end('internal error')
      }
    })
  })
  .listen(Number(process.env.PORT), () => console.log('adapter launcher ready'))
