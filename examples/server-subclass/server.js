const { createServer } = require('http')
const Server = require('next/server')

const thingsPattern = /^\/things\/?(.*)/

class MyServer extends Server {
  constructor () {
    super(...arguments)
    // you can override properties for instance
    this.quiet = false
  }
  // override the start method to provide a custom server
  async start (port, hostname) {
    await this.prepare()
    const handle = this.getRequestHandler()
    this.http = createServer((req, res) => {
      // custom route matching - in this case, we convert URLs from parameterized to query based
      const matches = req.url.match(thingsPattern)
      if (matches) {
        req.query.path = matches[1].split('/')
        req.url = '/things'
        this.render(req, res, req.url, req.query)
      } else {
        // fallback to default handling
        handle(req, res)
      }
    })
    // this is just copied from next's server/index.js
    await new Promise((resolve, reject) => {
      // This code catches EADDRINUSE error if the port is already in use
      this.http.on('error', reject)
      this.http.on('listening', () => resolve())
      this.http.listen(port, hostname)
    })
  }
}

module.exports = MyServer
