// Sloppy-mode CJS: octal literals are a syntax error under "use strict".
var legacy = 0777
module.exports.cjsValue = legacy
