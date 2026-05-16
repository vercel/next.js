import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { formatModuleTrace, getModuleTrace } from './getModuleTrace'
import { SimpleWebpackError } from './simpleWebpackError'

export function getDynamicCodeEvaluationError(
  message: string,
  module: webpack.NormalModule,
  compilation: webpack.Compilation,
  compiler: webpack.Compiler
): SimpleWebpackError {
  const { moduleTrace } = getModuleTrace(module, compilation, compiler)
  const { formattedModuleTrace, lastInternalFileName, invalidImportMessage } =
    formatModuleTrace(compiler, moduleTrace)

  return new SimpleWebpackError(
    lastInternalFileName,
    message +
      invalidImportMessage +
      '\n\nImport trace for requested module:\n' +
      formattedModuleTrace
  )
}
