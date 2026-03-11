import type webpack from 'webpack'

export type InvalidImportLoaderOpts = { message: string }

const nextInvalidImportErrorLoader: webpack.LoaderDefinitionFunction<InvalidImportLoaderOpts> =
  function () {
    const { message } = this.getOptions()
    const error = new Error(message)
    if (process.env.NEXT_RSPACK) {
      // Rspack uses miette for error formatting, which automatically includes stack
      // traces in the error message. To avoid showing redundant stack information
      // in the final error output, we clear the stack property.
      error.stack = undefined
    }
    throw error
  }

export default nextInvalidImportErrorLoader
