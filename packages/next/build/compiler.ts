import webpack from 'webpack'

type CompilerResult = {
  errors: Error[],
  warnings: Error[]
}

export function runCompiler (config: webpack.Configuration[]): Promise<CompilerResult> {
  return new Promise(async (resolve, reject) => {
    const compiler = webpack(config)
    compiler.run((err, multiStats: any) => {
      if (err) {
        return reject(err)
      }

      const result: CompilerResult = multiStats.stats.reduce((result: CompilerResult, stat: webpack.Stats): CompilerResult => {
        if (stat.compilation.errors.length > 0) {
          result.errors.push(...stat.compilation.errors)
        }

        if (stat.compilation.warnings.length > 0) {
          result.warnings.push(...stat.compilation.warnings)
        }

        return result
      }, {errors: [], warnings: []})

      resolve(result)
    })
  })
}
