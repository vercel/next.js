exports.buildCanonicalizedResource = function (resourcePath) {
  return `resource:${resourcePath}`
}

exports.buildCanonicalString = function (resourcePath) {
  // `this` is the exports object when called as `signUtils.buildCanonicalString()`
  return this.buildCanonicalizedResource(resourcePath)
}

// exports.usedExports = __webpack_exports_info__.usedExports;
