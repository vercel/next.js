exports.__esModule = true

exports.default = undefined

exports.init = function () {
  if (process.env.NEXT_PRIVATE_LOCAL_WEBPACK5) {
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
  } else {
    Object.assign(exports, require('./bundle5')())
  }
}
