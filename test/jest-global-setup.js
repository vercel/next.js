'use strict'

const chromedriver = require('chromedriver')
const waitPort = require('wait-port')

module.exports = async function globalSetup () {
  chromedriver.start()

  // https://github.com/giggio/node-chromedriver/issues/117
  await waitPort({
    port: 9515,
    timeout: 1000 * 60 * 2 // 2 Minutes
  })
}
