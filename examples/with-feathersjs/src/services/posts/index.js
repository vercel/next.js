'use strict'

const service = require('feathers-memory')

module.exports = function () {
  const app = this

  const serviceName = 'posts'
  const route = `/${serviceName}`

  let options = {
    paginate: {
      default: 5,
      max: 25
    }
  }

  // Initialize our service with any options it requires
  app.use(route, service(options))

  app.service(serviceName).create({
    id: 1,
    url: 'https://images.pexels.com/photos/188971/pexels-photo-188971.jpeg?w=1260&h=750&auto=compress&cs=tinysrgb'
  }).then(function (message) {
    console.log('Created message', message)
  })
  app.service(serviceName).create({
    id: 2,
    url: 'https://images.pexels.com/photos/127611/pexels-photo-127611.jpeg?h=350&auto=compress&cs=tinysrgb'
  }).then(function (message) {
    console.log('Created message', message)
  })
}
