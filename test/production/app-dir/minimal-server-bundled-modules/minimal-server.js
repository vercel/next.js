// Runs the pre-compiled server in minimal mode in this process, the way a
// serverless function entry does: it loads the server, lets it handle one
// request and reports which `next/dist` files the process has loaded.
const http = require('http')

process.env.NODE_ENV = 'production'

const NextServer =
  require('next/dist/compiled/next-server/server.runtime.prod.js').default
const { config } = require('./.next/required-server-files.json')

const handler = new NextServer({
  conf: config,
  dir: __dirname,
  minimalMode: true,
  customServer: false,
}).getRequestHandler()

const server = http.createServer(handler)
server.listen(0, '127.0.0.1', async () => {
  const res = await fetch(
    `http://127.0.0.1:${server.address().port}/api/ping`,
    {
      method: 'POST',
      headers: { 'x-matched-path': '/api/ping' },
    }
  )
  const body = await res.text()

  const result = {
    status: res.status,
    body,
    loaded: Object.keys(require.cache)
      .map((id) => id.replace(/\\/g, '/'))
      .filter((id) => id.includes('/next/dist/'))
      .map((id) => id.slice(id.lastIndexOf('/next/dist/') + 1))
      .sort(),
  }

  process.stdout.write(JSON.stringify(result) + '\n', () => process.exit(0))
})
