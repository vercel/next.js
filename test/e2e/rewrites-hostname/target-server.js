// @ts-check
const http = require('http')
const process = require('process')
const { promisify } = require('util')

/**
 * @returns {Promise<() => Promise<void>>} A promise that resolves to a function that closes the server
 */
function createServer(targetPort) {
  const server = http.createServer((req, res) => {
    const headers = req.headers

    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        forwardedHost: headers['x-forwarded-host'],
        host: headers['host'],
      })
    )
  })

  return new Promise((resolve, reject) => {
    server.listen(targetPort, () => {
      console.log(`Server listening on port ${targetPort}`)
      resolve(promisify(server.close.bind(server)))
    })
  })
}

module.exports = createServer

if (require.main === module) {
  const targetPort = parseInt(process.env.TEST_TARGET_PORT, 10)
  if (Number.isNaN(targetPort)) {
    throw new Error('TEST_TARGET_PORT is not set or invalid')
  }
  createServer(targetPort).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
