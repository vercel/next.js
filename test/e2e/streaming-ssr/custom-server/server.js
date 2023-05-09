const NextServer = require('next/dist/server/next-server').default
const defaultNextConfig =
  require('next/dist/server/config-shared').defaultConfig
const http = require('http')

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

let handler

const server = http.createServer(async (req, res) => {
  try {
    await handler(req, res)
  } catch (err) {
    console.error(err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
})
const currentPort = parseInt(process.env.PORT, 10) || 3000

server.listen(currentPort, (err) => {
  if (err) {
    console.error('Failed to start server', err)
    process.exit(1)
  }
  const nextServer = new NextServer({
    hostname: 'localhost',
    port: currentPort,
    customServer: true,
    dev: false,
    conf: {
      ...defaultNextConfig,
      distDir: '.next',
      experimental: {
        ...defaultNextConfig.experimental,
      },
    },
  })
  handler = nextServer.getRequestHandler()

  console.log('Listening on port', currentPort)
})
