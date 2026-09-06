exports.a = function () {
  // Arrows inherit the enclosing function's `this`
  return (() => this.b())()
}

exports.b = function () {
  return 'b'
}

// exports.usedExports = __webpack_exports_info__.usedExports;
