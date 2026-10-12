exports.__esModule = true

exports.default = undefined

if (process.env.NEXT_RSPACK) {
  Object.assign(exports, getRspackCore())
  Object.assign(exports, {
    StringXor: require('./bundle5')().StringXor,
  })
} else if (process.env.NEXT_PRIVATE_LOCAL_WEBPACK) {
  const path = require('path')
  const projectDir = process.env.NEXT_PRIVATE_LOCAL_WEBPACK
  // A bare require here resolves from Next.js's compiled package, which can find
  // a different webpack than next.config.js (or none in an isolated install).
  // Use the project's resolution base for all webpack imports instead.
  const projectRequire = require('module').createRequire(
    path.join(
      path.isAbsolute(projectDir) ? projectDir : process.cwd(),
      'package.json'
    )
  )
  Object.assign(exports, {
    BasicEvaluatedExpression: projectRequire(
      'webpack/lib/javascript/BasicEvaluatedExpression'
    ),
    ConcatenatedModule: projectRequire(
      'webpack/lib/optimize/ConcatenatedModule'
    ),
    makePathsAbsolute: projectRequire('webpack/lib/util/identifier')
      .makePathsAbsolute,
    ModuleFilenameHelpers: projectRequire('webpack/lib/ModuleFilenameHelpers'),
    NodeTargetPlugin: projectRequire('webpack/lib/node/NodeTargetPlugin'),
    RuntimeGlobals: projectRequire('webpack/lib/RuntimeGlobals'),
    SourceMapDevToolModuleOptionsPlugin: projectRequire(
      'webpack/lib/SourceMapDevToolModuleOptionsPlugin'
    ),
    StringXor: projectRequire('webpack/lib/util/StringXor'),
    NormalModule: projectRequire('webpack/lib/NormalModule'),
    sources: projectRequire('webpack').sources,
    webpack: projectRequire('webpack'),
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
