let globalSetup = () => {}

if (process.env.BROWSERSTACK) {
  const { Local } = require('browserstack-local')
  const browserStackLocal = new Local()
  const localBrowserStackOpts = {
    key: process.env.BROWSERSTACK_ACCESS_KEY,
    localIdentifier: new Date().getTime(), // Adding a unique local identifier to run parallel tests on BrowserStack
  }
  global.browserStackLocal = browserStackLocal

  globalSetup = () => {
    return new Promise((resolve, reject) => {
      browserStackLocal.start(localBrowserStackOpts, err => {
        if (err) return reject(err)
        console.log('Started BrowserStackLocal', browserStackLocal.isRunning())
        resolve()
      })
    })
  }
}

module.exports = globalSetup
