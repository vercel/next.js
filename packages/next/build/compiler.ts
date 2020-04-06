import webpack, { Stats, Configuration } from 'webpack'

export type CompilerResult = {
  errors: string[]
  warnings: string[]
}

function generateStats(result: CompilerResult, stat: Stats): CompilerResult {
  const { errors, warnings } = stat.toJson('errors-warnings')
  if (errors.length > 0) {
    result.errors.push(...errors)
  }

  if (warnings.length > 0) {
    result.warnings.push(...warnings)
  }

  return result
}

export function runCompiler(
  config: Configuration | Configuration[]
): Promise<CompilerResult> {
  return new Promise(async (resolve, reject) => {
    const compiler = webpack(config)
    compiler.run(
      (err: Error, statsOrMultiStats: { stats: Stats[] } | Stats) => {
        if (err) {
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
      }
    )
  })
}
