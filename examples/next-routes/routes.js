const routes = require('next-routes')
// Name   Page      Pattern
module.exports = routes() // ----   ----      -----
  .add('about') // about  about     /about
  .add('blog', '/blog/:slug') // blog   blog      /blog/:slug
  .add('user', '/user/:id', 'profile') // user   profile   /user/:id
  .add('/:noname/:lang(en|es)/:wow+', 'complex') // (none) complex   /:noname/:lang(en|es)/:wow+
  .add({ name: 'beta', pattern: '/v3', page: 'v3' }) // beta   v3        /v3
