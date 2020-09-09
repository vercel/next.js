import loaderUtils from 'loader-utils'
import path from 'path'
import webpack from 'webpack'
import SequentialCSSModuleLocalIdentGenerator from './helpers/SequentialCSSModuleLocalIdentGenerator'

const classnameGenerator = new SequentialCSSModuleLocalIdentGenerator()
const minifiedClassnameCache = new Map<string, string>()

// https://easylist-downloads.adblockplus.org/easylist.txt
const regexLikeAds = /^ad(s|v)?[0-9]*$/i
const regexLikeIndexModule = /(?<!pages[\\/])index\.module\.(scss|sass|css)$/

export function getCssModuleLocalIdent(isDevelopment: boolean) {
  return isDevelopment
    ? getVerboseCssModuleLocalIdent
    : getOptimizedCssModuleLocalIdent
}

function getOptimizedCssModuleLocalIdent(
  context: webpack.loader.LoaderContext,
  _: any,
  exportName: string,
  options: object
) {
  const verboseClassname = getVerboseCssModuleLocalIdent(
    context,
    _,
    exportName,
    options
  )
  return getMinifiedClassname(verboseClassname)
}

function getVerboseCssModuleLocalIdent(
  context: webpack.loader.LoaderContext,
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
    'md5',
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

function getMinifiedClassname(classname: string): string {
  // ensure we don't generate a new minified classname for an already minified one.
  const cachedClassname = minifiedClassnameCache.get(classname)
  if (cachedClassname) {
    return cachedClassname
  }

  const minifiedClassname = classnameGenerator.next()

  if (!regexLikeAds.test(minifiedClassname)) {
    minifiedClassnameCache.set(classname, minifiedClassname)
    return minifiedClassname
  }

  return getMinifiedClassname(classname)
}
