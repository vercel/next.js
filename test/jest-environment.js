// my-custom-environment
const http = require('http')
const getPort = require('get-port')
const NodeEnvironment = require('jest-environment-node')

const newTabPg = `
<!DOCTYPE html>
<html>
  <head>
    <title>new tab</title>
  </head>
  <body>
    <a href="about:blank" target="_blank" id="new">Click me</a>
  </body>
</html>
`

class CustomEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup()
    // Since ie11 doesn't like dataURIs we have to spin up a
    // server to handle the new tab page
    this.server = http.createServer((req, res) => {
      res.statusCode = 200
      res.end(newTabPg)
    })
    const newTabPort = await getPort()

    await new Promise((resolve, reject) => {
      this.server.listen(newTabPort, err => {
        if (err) return reject(err)
        resolve()
      })
    })

    this.global.wd = null
    this.global._newTabPort = newTabPort
    this.global.browserName = process.env.BROWSER_NAME || 'chrome'
    this.global.browserStackLocalId = global.browserStackLocalId
  }

  async teardown() {
    await super.teardown()
    if (this.server) {
      this.server.close()
    }
    if (this.global.wd) {
      await this.global.wd.quit()
    }
  }
}

module.exports = CustomEnvironment
