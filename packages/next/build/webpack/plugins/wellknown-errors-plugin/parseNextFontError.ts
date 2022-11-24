import { SimpleWebpackError } from './simpleWebpackError'

export function getNextFontError(
  err: Error,
  module: any
): SimpleWebpackError | false {
  try {
    const resourceResolveData = module.resourceResolveData
    if (resourceResolveData.descriptionFileData.name !== '@next/font') {
      return false
    }

    // Parse the query and get the path of the file where the font function was called.
    // provided by next-swc next_font_loaders
    const file = JSON.parse(resourceResolveData.query.slice(1)).path

    if (err.name === 'NextFontError') {
      // Known error thrown by @next/font, display the error message
      return new SimpleWebpackError(
        file,
        `\`@next/font\` error:\n${err.message}`
      )
    } else {
      // Unknown error thrown by @next/font
      // It might be becuase of incompatible versions of @next/font and next are being used, or it might be a bug

      // eslint-disable-next-line import/no-extraneous-dependencies
      const nextFontVersion = require('@next/font/package.json').version
      const nextVersion = require('next/package.json').version

      let message = `An error occured in \`@next/font\`.`

      // Using different versions of @next/font and next, add message that it's possibly fixed by updating both
      if (nextFontVersion !== nextVersion) {
        message += `\n\nYou might be using incompatible version of \`@next/font\` (${nextFontVersion}) and \`next\` (${nextVersion}). Try updating both \`@next/font\` and \`next\`, if the error still persists it may be a bug.`
      }

      message += `\n\n${err.stack}`

      return new SimpleWebpackError(file, message)
    }
  } catch {
    return false
  }
}
