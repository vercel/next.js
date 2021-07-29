import { webpack } from 'next/dist/compiled/webpack/webpack'

export type CompilerResult = {
  errors: string[]
  warnings: string[]
}

function generateStats(
  result: CompilerResult,
  stat: webpack.Stats
): CompilerResult {
  const { errors, warnings } = stat.toJson('errors-warnings')
  if (errors.length > 0) {
    result.errors.push(...errors)
  }

  if (warnings.length > 0) {
    result.warnings.push(...warnings)
  }

  return result
}

// Webpack 5 requires the compiler to be closed (to save caches)
// Webpack 4 does not have this close method so in order to be backwards compatible we check if it exists
function closeCompiler(compiler: webpack.Compiler | webpack.MultiCompiler) {
  return new Promise<void>((resolve, reject) => {
    if ('close' in compiler) {
      // @ts-ignore Close only exists on the compiler in webpack 5
      return compiler.close((err: any) => (err ? reject(err) : resolve()))
    }

    resolve()
  })
}

export function runCompiler(
  config: webpack.Configuration | webpack.Configuration[]
): Promise<CompilerResult> {
  return new Promise((resolve, reject) => {
    const compiler = webpack(config)
    compiler.run(
      (
        err: Error,
        statsOrMultiStats: { stats: webpack.Stats[] } | webpack.Stats
      ) => {
        closeCompiler(compiler).then(() => {
          if (err) {
            const reason = err?.toString()
            if (reason) {
              return resolve({ errors: [reason], warnings: [] })
            }
            return reject(err)
          }

          if ('stats' in statsOrMultiStats) {
            const result: CompilerResult = statsOrMultiStats.stats.reduce(
              generateStats,
              { errors: [], warnings: [] }
            )
            return resolve(result)
          }

          const result = generateStats(
            { errors: [], warnings: [] },
            statsOrMultiStats
          )
          return resolve(result)
        })
      }
    )
  })
}
