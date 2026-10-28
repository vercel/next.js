const { createServer } = require('node:http')
const { writeFile, rename } = require('node:fs/promises')
const next = require('next')
let app
let server
async function start(generation) {
  await writeFile(
    'next.config.js',
    `module.exports = {
    async headers() { return [{ source: '/:path*', headers: [{ key: 'x-runtime-generation', value: '${generation}' }] }] }
  }`
  )
  app = next({
    dev: true,
    dir: __dirname,
    webpack: process.env.IS_WEBPACK_TEST === '1',
  })
  await app.prepare()
  server = createServer(app.getRequestHandler())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  process.send({ generation, port: server.address().port, pid: process.pid })
}
async function close() {
  server.closeAllConnections()
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  await app.close()
}
process.on('message', async (message) => {
  try {
    await close()
    if (message === 'recreate') {
      await rename('pages/lifecycle-first.js', 'pages/lifecycle-second.js')
      await writeFile(
        'pages/lifecycle-second.js',
        'export default function Page() { return <p>second runtime destination</p> }'
      )
      await start(2)
    } else if (message === 'close') {
      process.disconnect()
    }
  } catch (error) {
    console.error(error)
    process.exitCode = 1
    process.disconnect()
  }
})
writeFile(
  'pages/lifecycle-first.js',
  'export default function Page() { return <p>first runtime destination</p> }'
)
  .then(() => start(1))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
    process.disconnect()
  })
