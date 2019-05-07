'use strict'
let globalSetup

if (process.env.BROWSERSTACK) {
  const { Local } = require('browserstack-local')
  const browserStackLocal = new Local()
  const localBrowserStackOpts = {
    key: process.env.BROWSERSTACK_ACCESS_KEY,
    localIdentifier: new Date().getTime() // Adding a unique local identifier to run parallel tests on BrowserStack
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
} else {
  const chromedriver = require('chromedriver')
  const waitPort = require('wait-port')

  globalSetup = async function globalSetup () {
    chromedriver.start()

    // https://github.com/giggio/node-chromedriver/issues/117
    await waitPort({
      port: 9515,
      timeout: 1000 * 60 * 2 // 2 Minutes
    })
  }
}

module.exports = () => globalSetup()
