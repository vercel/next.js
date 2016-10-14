
module.exports = function (content) {
  this.cacheable()

  return content + `
    if (module.hot) {
      module.hot.accept()
      if ('idle' !== module.hot.status()) {
        const Component = module.exports.default || module.exports
        next.router.notify({ Component })
      }
    }
  `
}
