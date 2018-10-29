'use strict'

const fkill = require('fkill')

module.exports = async function globalSetup () {
  await fkill(require('chromedriver').defaultInstance.pid)
}
