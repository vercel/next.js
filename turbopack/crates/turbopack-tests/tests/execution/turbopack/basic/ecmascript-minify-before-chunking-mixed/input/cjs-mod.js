// Sloppy-mode CJS: octal literals are a syntax error under "use strict".
var legacy = 0777
module.exports.cjsValue = legacy
// In sloppy mode, `this` is the global object in a plain function call.
module.exports.cjsIsSloppy = (function () {
  return this !== undefined
})()
