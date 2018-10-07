const chromedriver = require('chromedriver')

module.exports = async function globalSetup () {
  chromedriver.stop()
}
