import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin'
import { NormalizedMessage } from 'fork-ts-checker-webpack-plugin/lib/NormalizedMessage'
import webpack from 'webpack'

export function Apply(compiler: webpack.Compiler) {
  const hooks = ForkTsCheckerWebpackPlugin.getCompilerHooks(compiler)

  let additionalFiles: string[] = []

  hooks.receive.tap('ForkTsCheckerWatcherHook', function(
    diagnostics: NormalizedMessage[],
    lints: NormalizedMessage[]
  ) {
    additionalFiles = [
      ...new Set([
        ...diagnostics.map(d => d.file!),
        ...lints.map(l => l.file!),
      ]),
    ].filter(Boolean)
  })

  compiler.hooks.afterCompile.tap('ForkTsCheckerWatcherHook', function(
    compilation
  ) {
    additionalFiles.forEach(file => compilation.fileDependencies.add(file))
  })
}
