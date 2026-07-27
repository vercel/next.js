import type { Compiler } from 'webpack'

const PLUGIN_NAME = 'ReactRefreshRspackPlugin'

class ReactRefreshRspackPlugin {
  static loader = 'builtin:react-refresh-loader'

  apply(compiler: Compiler) {
    new compiler.webpack.ProvidePlugin({
      $ReactRefreshRuntime$: require.resolve('./internal/RspackReactRefresh'),
    }).apply(compiler)

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.additionalTreeRuntimeRequirements.tap(
        PLUGIN_NAME,
        (_, runtimeRequirements) => {
          runtimeRequirements.add(compiler.webpack.RuntimeGlobals.moduleCache)
        }
      )
    })
  }
}

export default ReactRefreshRspackPlugin
