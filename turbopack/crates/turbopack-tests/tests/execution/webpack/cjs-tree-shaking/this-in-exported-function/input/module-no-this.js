function helper() {
  // `this` outside an exported value does not disable tree-shaking
  return this
}

exports.a = function () {
  return typeof helper
}

exports.b = function () {
  return 'b'
}

// exports.usedExports = __webpack_exports_info__.usedExports;
