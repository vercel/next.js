exports.Impl = class Impl {
  constructor() {
    // `this` in an exported class is the instance, never the exports object
    this.x = 'x'
  }
}

exports.b = function () {
  return 'b'
}

// exports.usedExports = __webpack_exports_info__.usedExports;
