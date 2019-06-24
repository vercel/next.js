import { promisify } from 'util'
import webpack, { Stats } from 'webpack'

export type CompilerResult = {
  errors: Error[]
  warnings: Error[]
}

function generateStats(result: CompilerResult, stat: Stats): CompilerResult {
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
}

export async function runCompiler(
  config: webpack.Configuration | webpack.Configuration[]
): Promise<CompilerResult> {
  return new Promise(async (resolve, reject) => {
    // @ts-ignore webpack allows both a single config or array of configs
    const compiler = webpack(config)
    const run = promisify(compiler.run.bind(compiler))
    const statsOrMultiStats: any = await run()

    if (statsOrMultiStats.stats) {
      return statsOrMultiStats.stats.reduce(generateStats, {
        errors: [],
        warnings: [],
      })
    }

    return generateStats({ errors: [], warnings: [] }, statsOrMultiStats)
  })
}
