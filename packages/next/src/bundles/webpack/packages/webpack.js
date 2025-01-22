exports.__esModule = true

exports.default = undefined

exports.init = function () {
  console.log('init webpack')

  if (process.env.NEXT_RSPACK) {
    console.log('using rspack')
    // eslint-disable-next-line
    Object.assign(exports, require('@rspack/core'))
    Object.assign(exports, {
      StringXor: require('./StringXor'),
    })

    if (process.env.RSPACK_TRACE) {
      console.log('registering rspack trace')
      exports.rspack.experiments.globalTrace.register(
        'trace',
        'chrome',
        require('path').join(process.cwd(), `rspack-trace-${process.pid}.json`)
      )

      process.on('exit', () => {
        console.log('cleaning up rspack')
        exports.rspack.experiments.globalTrace.cleanup()
      })
    }
  } else if (process.env.NEXT_PRIVATE_LOCAL_WEBPACK) {
    Object.assign(exports, {
      // eslint-disable-next-line import/no-extraneous-dependencies
      BasicEvaluatedExpression: require('webpack/lib/javascript/BasicEvaluatedExpression'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      ConcatenatedModule: require('webpack/lib/optimize/ConcatenatedModule'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      makePathsAbsolute: require('webpack/lib/util/identifier')
        .makePathsAbsolute,
      // eslint-disable-next-line import/no-extraneous-dependencies
      ModuleFilenameHelpers: require('webpack/lib/ModuleFilenameHelpers'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      NodeTargetPlugin: require('webpack/lib/node/NodeTargetPlugin'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      RuntimeGlobals: require('webpack/lib/RuntimeGlobals'),
      // eslint-disable-next-line import/no-extraneous-dependencies
      SourceMapDevToolModuleOptionsPlugin: require('webpack/lib/SourceMapDevToolModuleOptionsPlugin'),
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
    console.log('loading bundle5')
    Object.assign(exports, require('./bundle5')())
  }
}
