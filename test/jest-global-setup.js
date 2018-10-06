const chromedriver = require('chromedriver')

module.exports = async function globalSetup () {
  return chromedriver.start()
}
