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

// Invoke the adapter entrypoint without Next's router and its render404 callback.
createServer((req, res) => {
  handler(req, res, {
    requestMeta: {
      minimalMode:
        !process.env.TEST_LAZY_HANDLER && !process.env.TEST_STATIC_HANDLER,
    },
  }).catch((error) => {
    console.error(error)
    res.statusCode = 500
    res.end('Handler failed')
  })
}).listen(Number(process.env.PORT), () => {
  console.log('Handler ready')
})
