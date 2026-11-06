import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { Span } from '@opentelemetry/api'
import {
  createLocalSpan,
  traceLocalSpan,
} from '../server/lib/trace/local-span-recorder'
import getWebpackBundler from '../shared/lib/get-webpack-bundler'

export type CompilerResult = {
  errors: webpack.StatsError[]
  warnings: webpack.StatsError[]
  stats: webpack.Stats | undefined
}

function generateStats(
  result: CompilerResult,
  stat: webpack.Stats
): CompilerResult {
  const { errors, warnings } = stat.toJson({
    preset: 'errors-warnings',
    moduleTrace: true,
  })
  if (errors && errors.length > 0) {
    result.errors.push(...errors)
  }

  if (warnings && warnings.length > 0) {
    result.warnings.push(...warnings)
  }

  return result
}

// Webpack 5 requires the compiler to be closed (to save caches)
// Webpack 4 does not have this close method so in order to be backwards compatible we check if it exists
function closeCompiler(compiler: webpack.Compiler | webpack.MultiCompiler) {
  return new Promise<void>((resolve, reject) => {
    // @ts-ignore Close only exists on the compiler in webpack 5
    return compiler.close((err: any) => (err ? reject(err) : resolve()))
  })
}

export function runCompiler(
  config: webpack.Configuration,
  {
    runWebpackSpan,
    inputFileSystem,
  }: {
    runWebpackSpan: Span
    inputFileSystem?: webpack.Compiler['inputFileSystem']
  }
): Promise<
  [
    result: CompilerResult,
    inputFileSystem?: webpack.Compiler['inputFileSystem'],
  ]
> {
  return new Promise((resolve, reject) => {
    const compiler = getWebpackBundler()(config)

    // Ensure we use the previous inputFileSystem
    if (inputFileSystem) {
      compiler.inputFileSystem = inputFileSystem
    }
    compiler.fsStartTime = Date.now()
    compiler.run((err, stats) => {
      const webpackCloseSpan = createLocalSpan({
        name: 'webpack-close',
        parent: runWebpackSpan,
        attributes: { name: config.name || 'unknown' },
      })
      traceLocalSpan({ span: webpackCloseSpan }, () =>
        closeCompiler(compiler)
      ).then(() => {
        if (err) {
          const reason = err.stack ?? err.toString()
          if (reason) {
            return resolve([
              {
                errors: [{ message: reason, details: (err as any).details }],
                warnings: [],
                stats,
              },
              compiler.inputFileSystem,
            ])
          }
          return reject(err)
        } else if (!stats) throw new Error('No Stats from webpack')

        const result = traceLocalSpan(
          {
            name: 'webpack-generate-error-stats',
            parent: webpackCloseSpan,
            synchronous: true,
          },
          () => generateStats({ errors: [], warnings: [], stats }, stats)
        )
        return resolve([result, compiler.inputFileSystem])
      })
    })
  })
}
