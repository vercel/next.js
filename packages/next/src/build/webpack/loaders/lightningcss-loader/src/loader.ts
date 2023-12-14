import valueParser from 'next/dist/compiled/postcss-value-parser'
import type { LoaderContext } from 'webpack'
import type { ILightningCssLoaderConfig, VisitorOptions } from './interface'
import { ECacheKey } from './interface'
import { transform as transformCss, type Visitor } from 'lightningcss'
import { Buffer } from 'buffer'
import { getTargets } from './utils'
import path from 'path'
import {
  getImportCode,
  type ApiParam,
  type ApiReplacement,
  type CssExport,
  type CssImport,
  getModuleCode,
  getExportCode,
} from './codegen'
import {
  getFilter,
  getPreRequester,
  isUrlRequestable,
} from '../../css-loader/src/utils'
import { stringifyRequest } from '../../../stringify-request'

function createVisitor(
  options: ILightningCssLoaderConfig,
  visitorOptions: VisitorOptions,
  apis: ApiParam[],
  imports: CssImport[],
  replacements: ApiReplacement[]
): Visitor<{}> {
  const importUrlToNameMap = new Map<string, string>()

  return {
    Rule: {
      import(node) {
        if (visitorOptions.importFilter) {
          const needKeep = visitorOptions.importFilter(
            node.value.url,
            node.value.media
          )
          if (!needKeep) {
            return node
          }
        }
        let url = node.value.url
        // TODO: Use identical logic as valueParser.stringify()
        const media = JSON.stringify(node.value.media.mediaQueries)
        const isRequestable = isUrlRequestable(url)
        let prefix: string | undefined
        if (isRequestable) {
          const queryParts = url.split('!')
          if (queryParts.length > 1) {
            url = queryParts.pop()!
            prefix = queryParts.join('!')
          }
        }
        if (!isRequestable) {
          apis.push({ url, media })
          return { type: 'ignored' }
        }
        const newUrl = prefix ? `${prefix}!${url}` : url
        let importName = importUrlToNameMap.get(newUrl)
        if (!importName) {
          importName = `___CSS_LOADER_AT_RULE_IMPORT_${importUrlToNameMap.size}___`
          importUrlToNameMap.set(newUrl, importName)
          imports.push({
            type: 'rule_import',
            importName,
            url: visitorOptions.urlHandler(newUrl),
          })
        }
        apis.push({ importName, media })
        return {
          type: 'ignored',
        }
      },
    },
    // Url(node) {
    //   console.log('Url.node', node)
    //   const { url } = node
    //   const { urlHandler } = visitorOptions
    //   node.url = urlHandler(url)
    //   console.log('After: Url.node', node)
    //   return node
    // },
  }
}

const LOADER_NAME = `lightningcss-loader`
export async function LightningCssLoader(
  this: LoaderContext<ILightningCssLoaderConfig>,
  source: string,
  prevMap?: Record<string, any>
): Promise<void> {
  const done = this.async()
  const options = this.getOptions()
  const { implementation, targets: userTargets, ...opts } = options

  options.modules ??= {}

  if (implementation && typeof implementation.transformCss !== 'function') {
    done(
      new TypeError(
        `[${LOADER_NAME}]: options.implementation.transformCss must be an 'lightningcss' transform function. Received ${typeof implementation.transformCss}`
      )
    )
    return
  }

  const exports: CssExport[] = []
  const imports: CssImport[] = []
  const api: ApiParam[] = []
  const replacements: ApiReplacement[] = []

  if (options.modules?.exportOnlyLocals !== true) {
    imports.unshift({
      type: 'api_import',
      importName: '___CSS_LOADER_API_IMPORT___',
      url: stringifyRequest(
        this,
        require.resolve('../../css-loader/src/runtime/api')
      ),
    })
  }
  const transform = implementation?.transformCss ?? transformCss

  try {
    const {
      code,
      map,
      exports: moduleExports,
    } = transform({
      visitor: createVisitor(
        options,
        {
          urlHandler: (url) =>
            stringifyRequest(
              this,
              getPreRequester(this)(options.importLoaders ?? 0) + url
            ),
          urlFilter: getFilter(options.url, this.resourcePath),
          importFilter: getFilter(options.import, this.resourcePath),
        },
        api,
        imports,
        replacements
      ),
      cssModules: options.modules
        ? {
            pattern: process.env.__NEXT_TEST_MODE
              ? '[name]__[local]'
              : '[name]__[hash]__[local]',
          }
        : undefined,
      filename: this.resourcePath,
      code: Buffer.from(source),
      sourceMap: this.sourceMap,
      targets: getTargets({ default: userTargets, key: ECacheKey.loader }),
      inputSourceMap:
        this.sourceMap && prevMap ? JSON.stringify(prevMap) : undefined,
      ...opts,
    })
    const cssCodeAsString = code.toString()

    if (moduleExports) {
      for (const name in moduleExports) {
        if (Object.prototype.hasOwnProperty.call(moduleExports, name)) {
          exports.push({
            name,
            value: moduleExports[name].name,
          })
        }
      }
    }

    const importCode = getImportCode(imports, options)
    const moduleCode = getModuleCode(
      { css: cssCodeAsString, map },
      api,
      replacements,
      options,
      this
    )
    const exportCode = getExportCode(exports, replacements, options)

    const esCode = `${importCode}${moduleCode}${exportCode}`
    done(null, esCode, map && JSON.parse(map.toString()))
  } catch (error: unknown) {
    done(error as Error)
  }
}

export const raw = true
