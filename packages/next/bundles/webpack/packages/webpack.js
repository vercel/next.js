exports.__esModule = true

exports.isWebpack5 = false

exports.default = undefined

let initializedWebpack5 = false
let initializedWebpack4 = false
let initFns = []
exports.init = function (useWebpack5) {
  if (process.env.NEXT_PRIVATE_LOCAL_WEBPACK5 && useWebpack5) {
    Object.assign(exports, {
      BasicEvaluatedExpression: require('webpack/lib/javascript/BasicEvaluatedExpression'),
      ModuleFilenameHelpers: require('webpack/lib/ModuleFilenameHelpers'),
      NodeTargetPlugin: require('webpack/lib/node/NodeTargetPlugin'),
      StringXor: require('webpack/lib/util/StringXor'),
      NormalModule: require('webpack/lib/NormalModule'),
      sources: require('webpack').sources,
      webpack: require('webpack'),
    })
    exports.isWebpack5 = true
  } else if (useWebpack5) {
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
  else initFns.push(cb)
}
