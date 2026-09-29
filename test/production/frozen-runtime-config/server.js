process.env.NODE_ENV = 'production'
require('next/dist/build/adapter/setup-node-env.external')
const { createServer } = require('http')

// Force manifest fallback by using a direct handler without a NextServer
// instance or a nextConfig override in router-server context.
const server = createServer(async (req, res) => {
  try {
    const { handler } = require('./.next/server/pages/index.js')
    await handler(req, res, {
      requestMeta: { minimalMode: true, relativeProjectDir: '.' },
    })
  } catch (error) {
    console.error(error)
    res.statusCode = 500
    res.end(String(error))
  }
})
server.listen(0, () => {
  console.log(`- Local: http://localhost:${server.address().port}`)
})
