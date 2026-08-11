exports.a = function () {
  // `this` in nested functions and class bodies is not the exports object,
  // so it must not disable tree-shaking
  const results = []
  function inner() {
    results.push(this)
  }
  class Inner {
    method() {
      results.push(this)
    }
  }
  inner.call('inner')
  new Inner().method()
  return results.length
}

exports.b = function () {
  return 'b'
}

// exports.usedExports = __webpack_exports_info__.usedExports;
