exports.__esModule = true

exports.isWebpack5 = false

exports.default = undefined

let initializedWebpack5 = false
let initializedWebpack4 = false
let initFns = []
exports.init = function (useWebpack5) {
  if (useWebpack5) {
    Object.assign(exports, require('./bundle5')())
    exports.isWebpack5 = true
    if (!initializedWebpack5) for (const cb of initFns) cb()
    initializedWebpack5 = true
  } else {
    Object.assign(exports, require('./bundle4')())
    exports.isWebpack5 = false
    if (!initializedWebpack4) for (const cb of initFns) cb()
    initializedWebpack4 = true
  }
}

exports.onWebpackInit = function (cb) {
  if (initializedWebpack5 || initializedWebpack4) cb()
  initFns.push(cb)
}
