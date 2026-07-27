import type { LoaderContext } from 'next/dist/compiled/webpack/webpack'
import camelCase from '../../css-loader/src/camelcase'
import {
  dashesCamelCase,
  normalizeSourceMapForRuntime,
} from '../../css-loader/src/utils'

export interface CssImport {
  icss?: boolean
  importName: string
  url: string
  type?: 'url' | string
  index?: number
}

export interface CssExport {
  name: string
  value: string
}

export interface ApiParam {
  url?: string
  importName?: string

  layer?: string
  supports?: string
  media?: string

  dedupe?: boolean
  index?: number
}

export interface ApiReplacement {
  replacementName: string
  localName?: string
  importName: string
  needQuotes?: boolean
  hash?: string
}

export function getImportCode(imports: CssImport[], options: any) {
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

export function getModuleCode(
  result: { map: any; css: any },
  api: ApiParam[],
  replacements: ApiReplacement[],
  options: any,
  loaderContext: LoaderContext<any>
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

export function getExportCode(
  exports: CssExport[],
  replacements: ApiReplacement[],
  options: any
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
