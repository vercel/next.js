const http = require('http')
const path = require('path')

require('next/dist/build/adapter/setup-node-env.external')

const dir = process.cwd()
const port = Number(process.env.PORT)
const pagesRoute = require(
  path.join(dir, '.next/server/pages/pages-route/[...slug].js')
)
const appNotFound = require(
  path.join(dir, '.next/server/app/_not-found/page.js')
)

http
  .createServer((req, res) => {
    Promise.resolve(
      pagesRoute.handler(req, res, {
        waitUntil: undefined,
        requestMeta: {
          initURL: `https://localhost${req.url}`,
          minimalMode: true,
          relativeProjectDir: '.',
          render404: async () => {
            req.headers['x-matched-path'] = '/_not-found'
            await appNotFound.handler(req, res, {
              waitUntil: undefined,
            })
          },
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
