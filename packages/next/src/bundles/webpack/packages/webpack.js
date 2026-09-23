exports.__esModule = true

exports.default = undefined

if (process.env.NEXT_RSPACK) {
  Object.assign(exports, getRspackCore())
  Object.assign(exports, {
    StringXor: require('./bundle5')().StringXor,
  })
} else if (process.env.NEXT_PRIVATE_LOCAL_WEBPACK) {
  Object.assign(exports, {
    BasicEvaluatedExpression: require('webpack/lib/javascript/BasicEvaluatedExpression'),
    ConcatenatedModule: require('webpack/lib/optimize/ConcatenatedModule'),
    makePathsAbsolute: require('webpack/lib/util/identifier').makePathsAbsolute,
    ModuleFilenameHelpers: require('webpack/lib/ModuleFilenameHelpers'),
    NodeTargetPlugin: require('webpack/lib/node/NodeTargetPlugin'),
    RuntimeGlobals: require('webpack/lib/RuntimeGlobals'),
    SourceMapDevToolModuleOptionsPlugin: require('webpack/lib/SourceMapDevToolModuleOptionsPlugin'),
    StringXor: require('webpack/lib/util/StringXor'),
    NormalModule: require('webpack/lib/NormalModule'),
    sources: require('webpack').sources,
    webpack: require('webpack'),
  })
} else {
  Object.assign(exports, require('./bundle5')())
}

function getRspackCore() {
  try {
    return require('next-rspack/rspack-core')
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        '@rspack/core is not available. Please make sure the appropriate Next.js plugin is installed.'
      )
    }

    throw e
  }
}
