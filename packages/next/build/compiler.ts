import webpack from 'webpack'

export type CompilerResult = {
  errors: Error[]
  warnings: Error[]
}

export function runCompiler(
  config: webpack.Configuration[]
): Promise<CompilerResult> {
  return new Promise(async (resolve, reject) => {
    const compiler = webpack(config)
    compiler.run((err, multiStats: any) => {
      if (err) {
        return reject(err)
      }

      const result: CompilerResult = multiStats.stats.reduce(
        (result: CompilerResult, stat: webpack.Stats): CompilerResult => {
          const { errors, warnings } = stat.toJson({
            all: false,
            warnings: true,
            errors: true,
          })
          if (errors.length > 0) {
            result.errors.push(...errors)
          }

          if (warnings.length > 0) {
            result.warnings.push(...warnings)
          }

          return result
        },
        { errors: [], warnings: [] }
      )

      resolve(result)
    })
  })
}
