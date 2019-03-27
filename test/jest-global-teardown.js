'use strict'

let globalTeardown

if (process.env.BROWSERSTACK_USERNAME) {
  globalTeardown = () => global.browserStackLocal.killAllProcesses(() => {})
} else {
  const chromedriver = require('chromedriver')
  globalTeardown = () => chromedriver.stop()
}

module.exports = () => globalTeardown()
