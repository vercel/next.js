const nextRoutes = require('next-routes')
const routes = nextRoutes()

routes.add('main', '/:slug/:child?', '')

module.exports = routes
