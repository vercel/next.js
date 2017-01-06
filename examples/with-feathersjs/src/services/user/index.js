'use strict'

const service = require('feathers-memory')
const hooks = require('./hooks')

module.exports = function () {
  const app = this

  let options = {
    paginate: {
      default: 5,
      max: 25
    }
  }

  // Initialize our service with any options it requires
  app.use('/users', service(options))

  // Get our initialize service to that we can bind hooks
  const userService = app.service('/users')

  // Set up our before hooks
  userService.before(hooks.before)

  // Set up our after hooks
  userService.after(hooks.after)
}
