const { createServer } = require('node:http')
const next = require('next')
const port = Number(process.argv[2])
const app = next({
  dev: true,
  dir: __dirname,
  hostname: 'localhost',
  port,
  ...JSON.parse(process.argv[3]),
})
const server = createServer(app.getRequestHandler())
app.prepare().then(() => server.listen(port))
