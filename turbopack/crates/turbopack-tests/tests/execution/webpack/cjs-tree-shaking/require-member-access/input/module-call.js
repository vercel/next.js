const fn = function () {
  return 'direct-call'
}
fn.x = 'x'
// fn.usedExports = __webpack_exports_info__.usedExports;
module.exports = fn
