const loaderUtils = require('loader-utils')

loaderUtils.getOptions = function (context) {
  return context.getOptions()
}

module.exports = loaderUtils
