import loaderUtils from 'next/dist/compiled/loader-utils3'
import path from 'path'
import type { webpack } from 'next/dist/compiled/webpack/webpack'

const regexLikeIndexModule = /(?<!pages[\\/])index\.module\.(scss|sass|css)$/

export function getCssModuleLocalIdent(
  context: webpack.LoaderContext<{}>,
  _: any,
  exportName: string,
  options: object
) {
  const relativePath = path
    .relative(context.rootContext, context.resourcePath)
    .replace(/\\+/g, '/')

  // Generate a more meaningful name (parent folder) when the user names the
  // file `index.module.css`.
  const fileNameOrFolder = regexLikeIndexModule.test(relativePath)
    ? '[folder]'
    : '[name]'

  // Generate a hash to make the class name unique.
  const hash = loaderUtils.getHashDigest(
    Buffer.from(`filePath:${relativePath}#className:${exportName}`),
    'sha1',
    'base64',
    5
  )

  // Have webpack interpolate the `[folder]` or `[name]` to its real value.
  return (
    loaderUtils
      .interpolateName(
        context,
        fileNameOrFolder + '_' + exportName + '__' + hash,
        options
      )
      .replace(
        // Webpack name interpolation returns `about.module_root__2oFM9` for
        // `.root {}` inside a file named `about.module.css`. Let's simplify
        // this.
        /\.module_/,
        '_'
      )
      // Replace invalid symbols with underscores instead of escaping
      // https://mathiasbynens.be/notes/css-escapes#identifiers-strings
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      // "they cannot start with a digit, two hyphens, or a hyphen followed by a digit [sic]"
      // https://www.w3.org/TR/CSS21/syndata.html#characters
      .replace(/^(\d|--|-\d)/, '__$1')
  )
}
