/**
 * Parameterized Routing with next-route
 *
 * Benefits: Less code, and easily handles complex url structures
**/
const routes = (module.exports = require('next-routes')())

routes.add('blog/entry', '/blog/:id')
