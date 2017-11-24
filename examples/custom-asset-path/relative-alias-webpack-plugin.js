module.exports = function (aliases) {
  return {
    apply: function (compiler) {
      compiler.plugin('compilation', (compilation) => {
        compilation.plugin('normal-module-loader', (loaderContext, module) => {
          const key = module.rawRequest.split('?')[0]
          if (aliases[key]) {
            module.resource = aliases[key]
          }
        })
      })
    }
  }
}
