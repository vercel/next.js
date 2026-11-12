require('next/dist/build/adapter/setup-node-env.external')

const { createServer } = require('node:http')
let entry
if (process.env.TEST_LAZY_HANDLER) {
  entry = './.next/server/app/lazy/[slug]/route.js'
} else if (process.env.TEST_STATIC_HANDLER) {
  entry = './.next/server/app/inferred/[lang]/[slug]/route.js'
} else {
  entry = './.next/server/app/prefix/[lang]/[slug]/route.js'
}
const { handler } = require(entry)

// Invoke the adapter entrypoint without Next's router, optionally supplying a
// page renderer that is unavailable in the isolated handler function.
createServer((req, res) => {
  handler(req, res, {
    requestMeta: {
      minimalMode:
        process.env.TEST_MINIMAL_MODE !== undefined
          ? process.env.TEST_MINIMAL_MODE === '1'
          : !process.env.TEST_LAZY_HANDLER && !process.env.TEST_STATIC_HANDLER,
      render404:
        process.env.TEST_RENDER_404 === '1'
          ? async () => {
              throw new Error('unavailable-page-renderer')
            }
          : undefined,
    },
  }).catch((error) => {
    console.error(error)
    res.statusCode = 500
    res.end('Handler failed')
  })
}).listen(Number(process.env.PORT), () => {
  console.log('Handler ready')
})
