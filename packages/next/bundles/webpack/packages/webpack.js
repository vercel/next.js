exports.__esModule = true

exports.isWebpack5 = false

exports.default = undefined

let initialized = false
let initFns = []
exports.init = function (useWebpack5) {
  if (useWebpack5) {
    exports.isWebpack5 = true
    Object.assign(exports, require('./bundle5')())
    initialized = true
    for (const cb of initFns) cb()
  } else {
    exports.isWebpack5 = false
    Object.assign(exports, require('./bundle4')())
    initialized = true
    for (const cb of initFns) cb()
  }
}

exports.onWebpackInit = function (cb) {
  if (initialized) cb()
  initFns.push(cb)
}
