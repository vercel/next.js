// Simulates whatwg-url/lib/URL-impl.js
exports.implementation = class URLImpl {
  constructor(args) {
    this.href = args[0]
  }
}
exports.unused = 'should be tree-shaken'
// exports.usedExports = __webpack_exports_info__.usedExports;
