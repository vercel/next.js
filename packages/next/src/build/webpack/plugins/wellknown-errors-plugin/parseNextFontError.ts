import { SimpleWebpackError } from './simpleWebpackError'

export function getNextFontError(
  err: Error,
  module: any
): SimpleWebpackError | false {
  try {
    const resourceResolveData = module.resourceResolveData
    if (
      !module.loaders.find((loader: any) =>
        /next-font-loader[/\\]index.js/.test(loader.loader)
      )
    ) {
      return false
    }

    // Parse the query and get the path of the file where the font function was called.
    // provided by next-swc next-transform-font
    const file = JSON.parse(resourceResolveData.query.slice(1)).path

    if (err.name === 'NextFontError') {
      // Known error thrown by @next/font, display the error message
      return new SimpleWebpackError(
        file,
        `\`next/font\` error:\n${err.message}`
      )
    } else {
      // Unknown error thrown by @next/font
      return new SimpleWebpackError(
        file,
        `An error occured in \`next/font\`.\n\n${err.stack}`
      )
    }
  } catch {
    return false
  }
}
