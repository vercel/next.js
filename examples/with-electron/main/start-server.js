const { app } = require('electron')
const { createServer } = require('http')
const dev = require('electron-is-dev')

module.exports = async () => {
  // start a HTTP server with Next as handler
  // using the renderer directory in the port 8000
  const { resolve } = require('app-root-path')
  const dir = resolve('./renderer')

  const next = require('next')
  const nextApp = next({ dev, dir })
  const nextHandler = nextApp.getRequestHandler()

  await nextApp.prepare()

  const server = createServer(nextHandler)

  return server.listen(8000, () => {
    app.on('before-quit', () => server.close())
  })
}
