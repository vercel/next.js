/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/
import { fileURLToPath } from 'url'
import path from 'path'

import { urlToRequest } from 'next/dist/compiled/loader-utils3'
import modulesValues from 'next/dist/compiled/postcss-modules-values'
import localByDefault from 'next/dist/compiled/postcss-modules-local-by-default'
import extractImports from 'next/dist/compiled/postcss-modules-extract-imports'
import modulesScope from 'next/dist/compiled/postcss-modules-scope'
import camelCase from './camelcase'

const whitespace = '[\\x20\\t\\r\\n\\f]'
const unescapeRegExp = new RegExp(
  `\\\\([\\da-f]{1,6}${whitespace}?|(${whitespace})|.)`,
  'ig'
)
const matchNativeWin32Path = /^[A-Z]:[/\\]|^\\\\/i

function unescape(str: string) {
  return str.replace(unescapeRegExp, (_, escaped, escapedWhitespace) => {
    const high = (`0x${escaped}` as any) - 0x10000

    /* eslint-disable line-comment-position */
    // NaN means non-codepoint
    // Workaround erroneous numeric interpretation of +"0x"
    // eslint-disable-next-line no-self-compare
    return high !== high || escapedWhitespace
      ? escaped
      : high < 0
      ? // BMP codepoint
        String.fromCharCode(high + 0x10000)
      : // Supplemental Plane codepoint (surrogate pair)
        // eslint-disable-next-line no-bitwise
        String.fromCharCode((high >> 10) | 0xd800, (high & 0x3ff) | 0xdc00)
    /* eslint-enable line-comment-position */
  })
}

function normalizePath(file: string) {
  return path.sep === '\\' ? file.replace(/\\/g, '/') : file
}

function fixedEncodeURIComponent(str: string) {
  return str.replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)
}

function normalizeUrl(url: string, isStringValue: boolean) {
  let normalizedUrl = url

  if (isStringValue && /\\(\n|\r\n|\r|\f)/.test(normalizedUrl)) {
    normalizedUrl = normalizedUrl.replace(/\\(\n|\r\n|\r|\f)/g, '')
  }

  if (matchNativeWin32Path.test(url)) {
    try {
      normalizedUrl = decodeURIComponent(normalizedUrl)
    } catch (error) {
      // Ignores invalid and broken URLs and try to resolve them as is
    }

    return normalizedUrl
  }

  normalizedUrl = unescape(normalizedUrl)

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  if (isDataUrl(url)) {
    return fixedEncodeURIComponent(normalizedUrl)
  }

  try {
    normalizedUrl = decodeURI(normalizedUrl)
  } catch (error) {
    // Ignores invalid and broken URLs and try to resolve them as is
  }

  return normalizedUrl
}

function requestify(url: string, rootContext: string) {
  if (/^file:/i.test(url)) {
    return fileURLToPath(url)
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return url
  }

  return url.charAt(0) === '/'
    ? urlToRequest(url, rootContext)
    : urlToRequest(url)
}

function getFilter(filter: any, resourcePath: string) {
  return (...args: any[]) => {
    if (typeof filter === 'function') {
      return filter(...args, resourcePath)
    }

    return true
  }
}

function shouldUseImportPlugin(options: any) {
  if (options.modules.exportOnlyLocals) {
    return false
  }

  if (typeof options.import === 'boolean') {
    return options.import
  }

  return true
}

function shouldUseURLPlugin(options: any) {
  if (options.modules.exportOnlyLocals) {
    return false
  }

  if (typeof options.url === 'boolean') {
    return options.url
  }

  return true
}

function shouldUseModulesPlugins(options: any) {
  return options.modules.compileType === 'module'
}

function shouldUseIcssPlugin(options: any) {
  return options.icss === true || Boolean(options.modules)
}

function getModulesPlugins(options: any, loaderContext: any, meta: any) {
  const {
    mode,
    getLocalIdent,
    localIdentName,
    localIdentContext,
    localIdentHashPrefix,
    localIdentRegExp,
  } = options.modules

  let plugins: any[] = []

  try {
    plugins = [
      modulesValues,
      localByDefault({ mode }),
      extractImports(),
      modulesScope({
        generateScopedName(exportName: any) {
          return getLocalIdent(
            loaderContext,
            localIdentName,
            exportName,
            {
              context: localIdentContext,
              hashPrefix: localIdentHashPrefix,
              regExp: localIdentRegExp,
            },
            meta
          )
        },
        exportGlobals: options.modules.exportGlobals,
      }),
    ]
  } catch (error) {
    loaderContext.emitError(error)
  }

  return plugins
}

const IS_NATIVE_WIN32_PATH = /^[a-z]:[/\\]|^\\\\/i
const ABSOLUTE_SCHEME = /^[a-z0-9+\-.]+:/i

function getURLType(source: string) {
  if (source[0] === '/') {
    if (source[1] === '/') {
      return 'scheme-relative'
    }

    return 'path-absolute'
  }

  if (IS_NATIVE_WIN32_PATH.test(source)) {
    return 'path-absolute'
  }

  return ABSOLUTE_SCHEME.test(source) ? 'absolute' : 'path-relative'
}

function normalizeSourceMap(map: any, resourcePath: string) {
  let newMap = map

  // Some loader emit source map as string
  // Strip any JSON XSSI avoidance prefix from the string (as documented in the source maps specification), and then parse the string as JSON.
  if (typeof newMap === 'string') {
    newMap = JSON.parse(newMap)
  }

  delete newMap.file

  const { sourceRoot } = newMap

  delete newMap.sourceRoot

  if (newMap.sources) {
    // Source maps should use forward slash because it is URLs (https://github.com/mozilla/source-map/issues/91)
    // We should normalize path because previous loaders like `sass-loader` using backslash when generate source map
    newMap.sources = newMap.sources.map((source: string) => {
      // Non-standard syntax from `postcss`
      if (source.indexOf('<') === 0) {
        return source
      }

      const sourceType = getURLType(source)

      // Do no touch `scheme-relative` and `absolute` URLs
      if (sourceType === 'path-relative' || sourceType === 'path-absolute') {
        const absoluteSource =
          sourceType === 'path-relative' && sourceRoot
            ? path.resolve(sourceRoot, normalizePath(source))
            : normalizePath(source)

        return path.relative(path.dirname(resourcePath), absoluteSource)
      }

      return source
    })
  }

  return newMap
}

function getPreRequester({ loaders, loaderIndex }: any) {
  const cache = Object.create(null)

  return (number: any) => {
    if (cache[number]) {
      return cache[number]
    }

    if (number === false) {
      cache[number] = ''
    } else {
      const loadersRequest = loaders
        .slice(
          loaderIndex,
          loaderIndex + 1 + (typeof number !== 'number' ? 0 : number)
        )
        .map((x: any) => x.request)
        .join('!')

      cache[number] = `-!${loadersRequest}!`
    }

    return cache[number]
  }
}

function getImportCode(imports: any, options: any) {
  let code = ''

  for (const item of imports) {
    const { importName, url, icss } = item

    if (options.esModule) {
      if (icss && options.modules.namedExport) {
        code += `import ${
          options.modules.exportOnlyLocals ? '' : `${importName}, `
        }* as ${importName}_NAMED___ from ${url};\n`
      } else {
        code += `import ${importName} from ${url};\n`
      }
    } else {
      code += `var ${importName} = require(${url});\n`
    }
  }

  return code ? `// Imports\n${code}` : ''
}

function normalizeSourceMapForRuntime(map: any, loaderContext: any) {
  const resultMap = map ? map.toJSON() : null

  if (resultMap) {
    delete resultMap.file

    resultMap.sourceRoot = ''

    resultMap.sources = resultMap.sources.map((source: string) => {
      // Non-standard syntax from `postcss`
      if (source.indexOf('<') === 0) {
        return source
      }

      const sourceType = getURLType(source)

      if (sourceType !== 'path-relative') {
        return source
      }

      const resourceDirname = path.dirname(loaderContext.resourcePath)
      const absoluteSource = path.resolve(resourceDirname, source)
      const contextifyPath = normalizePath(
        path.relative(loaderContext.rootContext, absoluteSource)
      )

      return `webpack://${contextifyPath}`
    })
  }

  return JSON.stringify(resultMap)
}

function getModuleCode(
  result: { map: any; css: any },
  api: any,
  replacements: any,
  options: {
    modules: { exportOnlyLocals: boolean; namedExport: any }
    sourceMap: any
  },
  loaderContext: any
) {
  if (options.modules.exportOnlyLocals === true) {
    return ''
  }

  const sourceMapValue = options.sourceMap
    ? `,${normalizeSourceMapForRuntime(result.map, loaderContext)}`
    : ''

  let code = JSON.stringify(result.css)
  let beforeCode = `var ___CSS_LOADER_EXPORT___ = ___CSS_LOADER_API_IMPORT___(${options.sourceMap});\n`

  for (const item of api) {
    const { url, media, dedupe } = item

    beforeCode += url
      ? `___CSS_LOADER_EXPORT___.push([module.id, ${JSON.stringify(
          `@import url(${url});`
        )}${media ? `, ${JSON.stringify(media)}` : ''}]);\n`
      : `___CSS_LOADER_EXPORT___.i(${item.importName}${
          media ? `, ${JSON.stringify(media)}` : dedupe ? ', ""' : ''
        }${dedupe ? ', true' : ''});\n`
  }

  for (const item of replacements) {
    const { replacementName, importName, localName } = item

    if (localName) {
      code = code.replace(new RegExp(replacementName, 'g'), () =>
        options.modules.namedExport
          ? `" + ${importName}_NAMED___[${JSON.stringify(
              camelCase(localName)
            )}] + "`
          : `" + ${importName}.locals[${JSON.stringify(localName)}] + "`
      )
    } else {
      const { hash, needQuotes } = item
      const getUrlOptions = [
        ...(hash ? [`hash: ${JSON.stringify(hash)}`] : []),
        ...(needQuotes ? 'needQuotes: true' : []),
      ]
      const preparedOptions =
        getUrlOptions.length > 0 ? `, { ${getUrlOptions.join(', ')} }` : ''

      beforeCode += `var ${replacementName} = ___CSS_LOADER_GET_URL_IMPORT___(${importName}${preparedOptions});\n`
      code = code.replace(
        new RegExp(replacementName, 'g'),
        () => `" + ${replacementName} + "`
      )
    }
  }

  return `${beforeCode}// Module\n___CSS_LOADER_EXPORT___.push([module.id, ${code}, ""${sourceMapValue}]);\n`
}

function dashesCamelCase(str: string) {
  return str.replace(/-+(\w)/g, (_match: any, firstLetter: string) =>
    firstLetter.toUpperCase()
  )
}

function getExportCode(
  exports: any,
  replacements: any,
  options: {
    modules: {
      namedExport: any
      exportLocalsConvention: any
      exportOnlyLocals: any
    }
    esModule: any
  }
) {
  let code = '// Exports\n'
  let localsCode = ''

  const addExportToLocalsCode = (name: string, value: any) => {
    if (options.modules.namedExport) {
      localsCode += `export const ${camelCase(name)} = ${JSON.stringify(
        value
      )};\n`
    } else {
      if (localsCode) {
        localsCode += `,\n`
      }

      localsCode += `\t${JSON.stringify(name)}: ${JSON.stringify(value)}`
    }
  }

  for (const { name, value } of exports) {
    switch (options.modules.exportLocalsConvention) {
      case 'camelCase': {
        addExportToLocalsCode(name, value)

        const modifiedName = camelCase(name)

        if (modifiedName !== name) {
          addExportToLocalsCode(modifiedName, value)
        }
        break
      }
      case 'camelCaseOnly': {
        addExportToLocalsCode(camelCase(name), value)
        break
      }
      case 'dashes': {
        addExportToLocalsCode(name, value)

        const modifiedName = dashesCamelCase(name)

        if (modifiedName !== name) {
          addExportToLocalsCode(modifiedName, value)
        }
        break
      }
      case 'dashesOnly': {
        addExportToLocalsCode(dashesCamelCase(name), value)
        break
      }
      case 'asIs':
      default:
        addExportToLocalsCode(name, value)
        break
    }
  }

  for (const item of replacements) {
    const { replacementName, localName } = item

    if (localName) {
      const { importName } = item

      localsCode = localsCode.replace(new RegExp(replacementName, 'g'), () => {
        if (options.modules.namedExport) {
          return `" + ${importName}_NAMED___[${JSON.stringify(
            camelCase(localName)
          )}] + "`
        } else if (options.modules.exportOnlyLocals) {
          return `" + ${importName}[${JSON.stringify(localName)}] + "`
        }

        return `" + ${importName}.locals[${JSON.stringify(localName)}] + "`
      })
    } else {
      localsCode = localsCode.replace(
        new RegExp(replacementName, 'g'),
        () => `" + ${replacementName} + "`
      )
    }
  }

  if (options.modules.exportOnlyLocals) {
    code += options.modules.namedExport
      ? localsCode
      : `${
          options.esModule ? 'export default' : 'module.exports ='
        } {\n${localsCode}\n};\n`

    return code
  }

  if (localsCode) {
    code += options.modules.namedExport
      ? localsCode
      : `___CSS_LOADER_EXPORT___.locals = {\n${localsCode}\n};\n`
  }

  code += `${
    options.esModule ? 'export default' : 'module.exports ='
  } ___CSS_LOADER_EXPORT___;\n`

  return code
}

async function resolveRequests(
  resolve: (arg0: any, arg1: any) => Promise<any>,
  context: any,
  possibleRequests: any[]
): Promise<any> {
  return resolve(context, possibleRequests[0])
    .then((result: any) => {
      return result
    })
    .catch((error: any) => {
      const [, ...tailPossibleRequests] = possibleRequests

      if (tailPossibleRequests.length === 0) {
        throw error
      }

      return resolveRequests(resolve, context, tailPossibleRequests)
    })
}

function isUrlRequestable(url: string) {
  // Protocol-relative URLs
  if (/^\/\//.test(url)) {
    return false
  }

  // `file:` protocol
  if (/^file:/i.test(url)) {
    return true
  }

  // Absolute URLs
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return true
  }

  // `#` URLs
  if (/^#/.test(url)) {
    return false
  }

  return true
}

function sort(a: { index: number }, b: { index: number }) {
  return a.index - b.index
}

function isDataUrl(url: string) {
  if (/^data:/i.test(url)) {
    return true
  }

  return false
}

export {
  isDataUrl,
  shouldUseModulesPlugins,
  shouldUseImportPlugin,
  shouldUseURLPlugin,
  shouldUseIcssPlugin,
  normalizeUrl,
  requestify,
  getFilter,
  getModulesPlugins,
  normalizeSourceMap,
  getPreRequester,
  getImportCode,
  getModuleCode,
  getExportCode,
  resolveRequests,
  isUrlRequestable,
  sort,
}
