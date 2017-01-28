module.exports = {
  customRoutes: [{
    test: /^\/$/,
    routeTo: '/foo'
  }, {
    test: /^\/about(\/?)$/,
    routeTo: '/bar'
  }]
}
