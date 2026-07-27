import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { formatModuleTrace, getModuleTrace } from './getModuleTrace'
import { SimpleWebpackError } from './simpleWebpackError'

export function getNextInvalidImportError(
  err: Error,
  module: any,
  compilation: webpack.Compilation,
  compiler: webpack.Compiler
): SimpleWebpackError | false {
  try {
    if (
      !module.loaders.find((loader: any) =>
        loader.loader.includes('next-invalid-import-error-loader.js')
      )
    ) {
      return false
    }

    const { moduleTrace } = getModuleTrace(module, compilation, compiler)
    const { formattedModuleTrace, lastInternalFileName, invalidImportMessage } =
      formatModuleTrace(compiler, moduleTrace)

    return new SimpleWebpackError(
      lastInternalFileName,
      err.message +
        invalidImportMessage +
        '\n\nImport trace for requested module:\n' +
        formattedModuleTrace
    )
  } catch {
    return false
  }
}
