import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { getImportTrace } from './getImportTrace'
import { SimpleWebpackError } from './simpleWebpackError'

export function getNextImportTraceError(
  err: Error,
  module: any,
  compilation: webpack.Compilation,
  compiler: webpack.Compiler
): SimpleWebpackError | false {
  try {
    if (
      !module.loaders.find((loader: any) =>
        loader.loader.includes('next-import-trace-error-loader.js')
      )
    ) {
      return false
    }

    const { importTrace } = getImportTrace(module, compilation, compiler)
    const last = importTrace[importTrace.length - 1] ?? ''

    return new SimpleWebpackError(
      last,
      err.message +
        `\n\nImport trace for requested module:\n${importTrace.join('\n')}`
    )
  } catch {
    return false
  }
}
