'use strict'

const chromedriver = require('chromedriver')

module.exports = async function globalSetup (config) {
  if (config.testPathPattern === 'packages') {
    return
  }

  chromedriver.stop()
}
