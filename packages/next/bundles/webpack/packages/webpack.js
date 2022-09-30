exports.__esModule = true

exports.default = undefined

exports.init = function () {
  if (process.env.NEXT_PRIVATE_LOCAL_WEBPACK) {
    Object.assign(exports, {
      // eslint-disable-next-line import/no-extraneous-dependencies
      BasicEvaluatedExpression: require('webpack/lib/javascript/BasicEvaluatedExpression'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      ModuleFilenameHelpers: require('webpack/lib/ModuleFilenameHelpers'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      NodeTargetPlugin: require('webpack/lib/node/NodeTargetPlugin'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      StringXor: require('webpack/lib/util/StringXor'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      NormalModule: require('webpack/lib/NormalModule'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      sources: require('webpack').sources,
      // eslint-disable-next-line import/no-extraneous-dependencies
      webpack: require('webpack'),
    })
  } else {
    Object.assign(exports, require('./bundle5')())
  }
}
