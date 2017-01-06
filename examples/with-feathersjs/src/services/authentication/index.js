'use strict'

const authentication = require('feathers-authentication')

module.exports = function () {
  const app = this

  let config = app.get('auth')

  app.configure(authentication(config))
}
