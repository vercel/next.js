exports.__esModule = true

exports.isWebpack5 = false

exports.default = undefined

let initializedWebpack5 = false
let initializedWebpack4 = false
let initFns = []
exports.init = function (useWebpack5) {
  if (useWebpack5) {
    exports.isWebpack5 = true
    Object.assign(exports, require('./bundle5')())
    if (!initializedWebpack5) for (const cb of initFns) cb()
    initializedWebpack5 = true
  } else {
    exports.isWebpack5 = false
    Object.assign(exports, require('./bundle4')())
    if (!initializedWebpack4) for (const cb of initFns) cb()
    initializedWebpack4 = true
  }
}

exports.onWebpackInit = function (cb) {
  if (initializedWebpack5 || initializedWebpack4) cb()
  initFns.push(cb)
}
