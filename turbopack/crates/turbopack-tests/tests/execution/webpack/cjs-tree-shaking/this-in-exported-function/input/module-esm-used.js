exports.build = function (resourcePath) {
  return `resource:${resourcePath}`
}

exports.sign = function (resourcePath) {
  return this.build(resourcePath)
}
