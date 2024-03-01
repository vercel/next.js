import loaderUtils from 'next/dist/compiled/loader-utils3'
import path from 'path'
import type { webpack } from 'next/dist/compiled/webpack/webpack'

const regexLikeIndexModule = /(?<!pages[\\/])index\.module\.(scss|sass|css)$/

export function getCssModuleLocalIdent(minify?: boolean) {
  return (
    context: webpack.LoaderContext<{}>,
    _: any,
    exportName: string,
    options: object
  ) => {
    const relativePath = path
      .relative(context.rootContext, context.resourcePath)
      .replace(/\\+/g, '/')

    const hash = calculateHashFromRelativePathAndName(relativePath, exportName)

    if (!minify) {
      // Generate a more meaningful name (parent folder) when the user names the
      // file `index.module.css`.
      const fileNameOrFolder = regexLikeIndexModule.test(relativePath)
        ? '[folder]'
        : '[name]'

      let name = fileNameOrFolder + '_' + exportName + '__' + hash
      name = name
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

      return toValidCSSIdentifier(
        // Have webpack interpolate the `[folder]` or `[name]` to its real value.
        loaderUtils.interpolateName(context, name, options)
      )
    }

    return toValidCSSIdentifier(hash)
  }
}

const urlSafeBase64Lookup =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/**
 * Converts a number to an url safe base64 string
 * @param input A positive integer
 * @returns An url safe base64 string @see https://datatracker.ietf.org/doc/html/rfc4648#section-5
 */
function toUrlSafeBase64(input: number) {
  let result = ''
  do {
    result = urlSafeBase64Lookup[input & 63] + result
    input = input >> 6
  } while (input > 0)
  return result
}

const nameMap = new Map<string, number>()
let currentFilePath = ''

/**
 * Calculate a hash based on the relative path and the export name
 * @param relativePath The relative path of the file
 * @param exportName The export name (class name)
 * @returns The first 6 characters of the hash concatenated with a unique number (in url safe base64)
 */
function calculateHashFromRelativePathAndName(
  relativePath: string,
  exportName: string
) {
  if (currentFilePath !== relativePath) {
    nameMap.clear()
    currentFilePath = relativePath
  }
  const key = nameMap.get(exportName) || nameMap.size
  if (!nameMap.has(exportName)) {
    nameMap.set(exportName, nameMap.size)
  }

  // Generate a hash to make the class name unique. Generates url safe base64 strings
  return (
    loaderUtils.getHashDigest(
      Buffer.from(`filePath:${relativePath}`),
      'sha1',
      'base64',
      6
    ) + toUrlSafeBase64(key)
  )
}

/**
 * Valid CSS identifiers can contain only [a-zA-Z0-9-_]
 * and can't start with a digit, two hyphens, or a hyphen followed by a digit.
 * This function replaces invalid symbols with underscores
 * @param base64str Urlsafe base64 string
 * @returns A valid CSS identifier
 */
function toValidCSSIdentifier(base64str: string) {
  // "they cannot start with a digit, two hyphens, or a hyphen followed by a digit [sic]"
  // https://www.w3.org/TR/CSS21/syndata.html#characters
  return base64str.replace(/^(\d|--|-\d)/, '__$1')
}
