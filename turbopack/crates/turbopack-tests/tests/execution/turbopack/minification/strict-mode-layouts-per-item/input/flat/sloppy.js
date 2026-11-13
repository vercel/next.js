// A CommonJS module without a directive is sloppy, so `this` in a plain function call is the
// global object.
module.exports = (function () {
  return this
})()
