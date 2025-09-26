import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { relative } from 'path'
import { SimpleWebpackError } from './simpleWebpackError'
import { getAppLoader } from '../../../entries'

export function getNextAppLoaderError(
  err: Error,
  module: any,
  compiler: webpack.Compiler
): SimpleWebpackError | false {
  try {
    if (!module.loaders[0].loader.includes(getAppLoader())) {
      return false
    }

    const file = relative(
      compiler.context,
      module.buildInfo.route.absolutePagePath
    )

    return new SimpleWebpackError(file, err.message)
  } catch {
    return false
  }
}
