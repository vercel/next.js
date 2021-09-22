exports.__esModule = true

exports.isWebpack5 = false

exports.default = undefined

let initializedWebpack5 = false
let initializedWebpack4 = false
let initFns = []
exports.init = function (useWebpack5) {
  if (process.env.NEXT_PRIVATE_LOCAL_WEBPACK5 && useWebpack5) {
    Object.assign(exports, {
      // eslint-disable-next-line import/no-extraneous-dependencies
      BasicEvaluatedExpression: require('webpack5/lib/javascript/BasicEvaluatedExpression'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      ModuleFilenameHelpers: require('webpack5/lib/ModuleFilenameHelpers'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      NodeTargetPlugin: require('webpack5/lib/node/NodeTargetPlugin'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      StringXor: require('webpack5/lib/util/StringXor'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      NormalModule: require('webpack5/lib/NormalModule'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      sources: require('webpack5').sources,
      // eslint-disable-next-line import/no-extraneous-dependencies
      webpack: require('webpack5'),
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
