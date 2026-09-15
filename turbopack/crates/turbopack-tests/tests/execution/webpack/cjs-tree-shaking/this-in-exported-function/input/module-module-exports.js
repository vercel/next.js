module.exports.a = function () {
  return this.b()
}

module.exports.b = function () {
  return 'b'
}

// module.exports.usedExports = __webpack_exports_info__.usedExports;
