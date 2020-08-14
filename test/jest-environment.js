// my-custom-environment
const http = require('http')
const getPort = require('get-port')
const seleniumServer = require('selenium-standalone')
const NodeEnvironment = require('jest-environment-node')

const {
  BROWSER_NAME: browserName = 'chrome',
  SKIP_LOCAL_SELENIUM_SERVER,
} = process.env

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
      this.server.listen(newTabPort, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    let seleniumServerPort

    if (browserName !== 'chrome' && SKIP_LOCAL_SELENIUM_SERVER !== 'true') {
      console.log('Installing selenium server')
      await new Promise((resolve, reject) => {
        seleniumServer.install((err) => {
          if (err) return reject(err)
          resolve()
        })
      })

      console.log('Starting selenium server')
      await new Promise((resolve, reject) => {
        seleniumServer.start((err, child) => {
          if (err) return reject(err)
          this.seleniumServer = child
          resolve()
        })
      })
      console.log('Started selenium server')
      seleniumServerPort = 4444
    }

    this.global.wd = null
    this.global._newTabPort = newTabPort
    this.global.browserName = browserName
    this.global.seleniumServerPort = seleniumServerPort
    this.global.browserStackLocalId = global.browserStackLocalId
  }

  async teardown() {
    await super.teardown()

    if (this.server) {
      this.server.close()
    }
    if (this.global.wd) {
      try {
        await this.global.wd.quit()
      } catch (err) {
        console.log(`Failed to quit webdriver instance`, err)
      }
    }
    // must come after wd.quit()
    if (this.seleniumServer) {
      this.seleniumServer.kill()
    }
  }
}

module.exports = CustomEnvironment
