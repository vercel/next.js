import type webpack from 'webpack'

export type InvalidImportLoaderOpts = { message: string }

const nextInvalidImportErrorLoader: webpack.LoaderDefinitionFunction<InvalidImportLoaderOpts> =
  function () {
    const { message } = this.getOptions()
    throw new Error(message)
  }

export default nextInvalidImportErrorLoader
