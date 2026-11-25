this.a = function () {
  return this.b()
}

this.b = function () {
  return 'b'
}

// this.usedExports = __webpack_exports_info__.usedExports;
