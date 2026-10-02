require('next/dist/build/adapter/setup-node-env.external')

const { createServer } = require('node:http')
const { handler } = require('./.next/server/app/products/[slug]/page.js')

// Invoke the built adapter entrypoint directly. Starting Next's router server
// would supply render404 and hide the handler's callback-less response path.
createServer((req, res) => {
  handler(req, res, {}).catch((error) => {
    console.error(error)
    res.statusCode = 500
    res.end('Handler failed')
  })
}).listen(Number(process.env.PORT), () => {
  console.log('Adapter ready')
})
