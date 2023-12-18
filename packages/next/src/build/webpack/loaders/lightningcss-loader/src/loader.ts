import valueParser from 'next/dist/compiled/postcss-value-parser'
import type { LoaderContext } from 'webpack'
import type { ILightningCssLoaderConfig, VisitorOptions } from './interface'
import { ECacheKey } from './interface'
import { transform as transformCss, type Url, type Visitor } from 'lightningcss'
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
  isDataUrl,
  isUrlRequestable,
  requestify,
  resolveRequests,
} from '../../css-loader/src/utils'
import { stringifyRequest } from '../../../stringify-request'

function createVisitor(
  options: ILightningCssLoaderConfig,
  visitorOptions: VisitorOptions,
  apis: ApiParam[],
  imports: CssImport[],
  replacements: ApiReplacement[],
  replacedUrls: Map<number, string>
): Visitor<{}> {
  const importUrlToNameMap = new Map<string, string>()

  let hasUrlImportHelper = false
  const urlToNameMap = new Map()
  const urlToReplacementMap = new Map()
  let urlIndex = -1

  function handleUrl(u: Url): Url {
    let url = u.url
    const needKeep = visitorOptions.urlFilter(url)

    if (!needKeep) {
      return u
    }

    if (isDataUrl(url)) {
      return u
    }

    replacedUrls.set(urlIndex, url)
    url = `__NEXT_LIGHTNINGCSS_LOADER_URL_REPLACE_${urlIndex}__`

    const [, query, hashOrQuery] = url.split(/(\?)?#/, 3)

    const queryParts = url.split('!')
    let prefix: string | undefined

    if (queryParts.length > 1) {
      url = queryParts.pop()!
      prefix = queryParts.join('!')
    }

    let hash = query ? '?' : ''
    hash += hashOrQuery ? `#${hashOrQuery}` : ''

    urlIndex++

    if (!hasUrlImportHelper) {
      imports.push({
        type: 'get_url_import',
        importName: '___CSS_LOADER_GET_URL_IMPORT___',
        url: JSON.stringify(
          require.resolve('../../css-loader/src/runtime/getUrl.js')
        ),
        index: -1,
      })

      hasUrlImportHelper = true
    }

    const newUrl = prefix ? `${prefix}!${url}` : url
    let importName = urlToNameMap.get(newUrl)

    if (!importName) {
      importName = `___CSS_LOADER_URL_IMPORT_${urlToNameMap.size}___`
      urlToNameMap.set(newUrl, importName)

      imports.push({
        type: 'url',
        importName,
        url: JSON.stringify(newUrl),
        index: urlIndex,
      })
    }
    // This should be true for string-urls in image-set
    const needQuotes = false

    const replacementKey = JSON.stringify({ newUrl, hash, needQuotes })
    let replacementName = urlToReplacementMap.get(replacementKey)

    if (!replacementName) {
      replacementName = `___CSS_LOADER_URL_REPLACEMENT_${urlToReplacementMap.size}___`
      urlToReplacementMap.set(replacementKey, replacementName)

      replacements.push({
        replacementName,
        importName,
        hash,
        needQuotes,
      })
    }

    return {
      loc: u.loc,
      url: replacementName,
    }
  }

  return {
    Rule: {
      import(node) {
        console.log('import', node)
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
        console.log('url', url)
        console.log('isRequestable', isRequestable)
        if (!isRequestable) {
          apis.push({ url, media })
          // Bug of lightningcss
          return { type: 'ignored', value: '' }
        }
        const newUrl = prefix ? `${prefix}!${url}` : url
        let importName = importUrlToNameMap.get(newUrl)
        if (!importName) {
          importName = `___CSS_LOADER_AT_RULE_IMPORT_${importUrlToNameMap.size}___`
          importUrlToNameMap.set(newUrl, importName)

          const importUrl = visitorOptions.urlHandler(newUrl)
          console.log('importUrl', importUrl)
          imports.push({
            type: 'rule_import',
            importName,
            url: importUrl,
          })
        }
        console.log('importName', importName)
        apis.push({ importName, media })
        // Bug of lightningcss
        return { type: 'ignored', value: '' }
      },
    },
    Url(node) {
      return handleUrl(node)
    },
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
  const apis: ApiParam[] = []
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

  const urlResolver = this.getResolve({
    conditionNames: ['asset'],
    mainFields: ['asset'],
    mainFiles: [],
    extensions: [],
  })

  const replacedUrls = new Map<number, string>()

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

          context: this.context,
          urlResolver,
        },
        apis,
        imports,
        replacements,
        replacedUrls
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
    let cssCodeAsString = code.toString()

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
    console.log('code', cssCodeAsString)
    console.log('apis', apis)
    console.log('imports', imports)
    console.log('replacements', replacements)

    for (const [index, url] of replacedUrls.entries()) {
      const [pathname, ,] = url.split(/(\?)?#/, 3)

      const request = requestify(pathname, this.rootContext)
      const resolvedUrl = await resolveRequests(urlResolver, this.context, [
        ...new Set([request, url]),
      ])

      cssCodeAsString = cssCodeAsString.replace(
        `__NEXT_LIGHTNINGCSS_LOADER_URL_REPLACE_${index}__`,
        resolvedUrl
      )

      if (!resolvedUrl) {
      }
    }

    const importCode = getImportCode(imports, options)
    const moduleCode = getModuleCode(
      { css: cssCodeAsString, map },
      apis,
      replacements,
      options,
      this
    )
    const exportCode = getExportCode(exports, replacements, options)

    const esCode = `${importCode}${moduleCode}${exportCode}`
    done(null, esCode, map && JSON.parse(map.toString()))
  } catch (error: unknown) {
    console.log('lightningcss-loader error', error)
    done(error as Error)
  }
}

export const raw = true
