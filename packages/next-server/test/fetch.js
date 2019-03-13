const http = require('http')
const fetch = require('node-fetch')

const createServer = handler => new Promise((resolve, reject) => {
  const server = http.createServer(handler)

  server.listen(0, (err) => {
    if (err) {
      return reject(err)
    }

    resolve(server)
  })
})

module.exports = (app) => {
  const handler = app.getRequestHandler()

  return async (path, options) => {
    const server = await createServer(handler)
    const port = server.address().port
    const result = await fetch('http://127.0.0.1:' + port + path, options)
    server.close()
    return result
  }
}
