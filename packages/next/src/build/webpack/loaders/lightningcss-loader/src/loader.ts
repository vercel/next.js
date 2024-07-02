import type { LoaderContext } from 'webpack'
import { getTargets } from './utils'
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
import { ECacheKey } from './interface'

const encoder = new TextEncoder()

function createUrlAndImportVisitor(
  visitorOptions: any,
  apis: ApiParam[],
  imports: CssImport[],
  replacements: ApiReplacement[],
  replacedUrls: Map<number, string>,
  replacedImportUrls: Map<number, string>
) {
  const importUrlToNameMap = new Map<string, string>()

  let hasUrlImportHelper = false
  const urlToNameMap = new Map()
  const urlToReplacementMap = new Map()
  let urlIndex = -1
  let importUrlIndex = -1

  function handleUrl(u: { url: string; loc: unknown }): unknown {
    let url = u.url
    const needKeep = visitorOptions.urlFilter(url)

    if (!needKeep) {
      return u
    }

    if (isDataUrl(url)) {
      return u
    }

    urlIndex++

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
      import(node: any) {
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

        importUrlIndex++

        replacedImportUrls.set(importUrlIndex, url)
        url = `__NEXT_LIGHTNINGCSS_LOADER_IMPORT_URL_REPLACE_${importUrlIndex}__`

        // TODO: Use identical logic as valueParser.stringify()
        const media = node.value.media.mediaQueries.length
          ? JSON.stringify(node.value.media.mediaQueries)
          : undefined
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
          // Bug of lightningcss
          return { type: 'ignored', value: '' }
        }
        const newUrl = prefix ? `${prefix}!${url}` : url
        let importName = importUrlToNameMap.get(newUrl)
        if (!importName) {
          importName = `___CSS_LOADER_AT_RULE_IMPORT_${importUrlToNameMap.size}___`
          importUrlToNameMap.set(newUrl, importName)

          const importUrl = visitorOptions.urlHandler(newUrl)
          imports.push({
            type: 'rule_import',
            importName,
            url: importUrl,
          })
        }
        apis.push({ importName, media })
        // Bug of lightningcss
        return { type: 'ignored', value: '' }
      },
    },
    Url(node: any) {
      return handleUrl(node)
    },
  }
}

function createIcssVisitor({
  apis,
  imports,
  replacements,
  replacedUrls,
  urlHandler,
}: {
  apis: ApiParam[]
  imports: CssImport[]
  replacements: ApiReplacement[]
  replacedUrls: Map<number, string>
  urlHandler: (url: any) => string
}) {
  let index = -1
  let replacementIndex = -1

  return {
    Declaration: {
      composes(node: any) {
        if (node.property === 'unparsed') {
          return
        }

        const specifier = node.value.from

        if (specifier?.type !== 'file') {
          return
        }

        let url = specifier.value
        if (!url) {
          return
        }

        index++

        replacedUrls.set(index, url)
        url = `__NEXT_LIGHTNINGCSS_LOADER_ICSS_URL_REPLACE_${index}__`

        const importName = `___CSS_LOADER_ICSS_IMPORT_${imports.length}___`
        imports.push({
          type: 'icss_import',
          importName,
          icss: true,
          url: urlHandler(url),
          index,
        })

        apis.push({ importName, dedupe: true, index })

        const newNames: string[] = []

        for (const localName of node.value.names) {
          replacementIndex++
          const replacementName = `___CSS_LOADER_ICSS_IMPORT_${index}_REPLACEMENT_${replacementIndex}___`

          replacements.push({
            replacementName,
            importName,
            localName,
          })
          newNames.push(replacementName)
        }

        return {
          property: 'composes',
          value: {
            loc: node.value.loc,
            names: newNames,
            from: specifier,
          },
        }
      },
    },
  }
}

const LOADER_NAME = `lightningcss-loader`
export async function LightningCssLoader(
  this: LoaderContext<any>,
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

  if (options.postcss) {
    const { postcssWithPlugins } = await options.postcss()

    if (postcssWithPlugins?.plugins?.length > 0) {
      throw new Error(
        `[${LOADER_NAME}]: experimental.useLightningcss does not work with postcss plugins. Please remove 'useLightningcss: true' from your configuration.`
      )
    }
  }

  const exports: CssExport[] = []
  const imports: CssImport[] = []
  const icssImports: CssImport[] = []
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
  const { loadBindings } = require('next/dist/build/swc')

  const transform =
    implementation?.transformCss ??
    (await loadBindings()).css.lightning.transform

  const replacedUrls = new Map<number, string>()
  const icssReplacedUrls = new Map<number, string>()
  const replacedImportUrls = new Map<number, string>()

  const urlImportVisitor = createUrlAndImportVisitor(
    {
      urlHandler: (url: any) =>
        stringifyRequest(
          this,
          getPreRequester(this)(options.importLoaders ?? 0) + url
        ),
      urlFilter: getFilter(options.url, this.resourcePath),
      importFilter: getFilter(options.import, this.resourcePath),

      context: this.context,
    },
    apis,
    imports,
    replacements,
    replacedUrls,
    replacedImportUrls
  )

  const icssVisitor = createIcssVisitor({
    apis,
    imports: icssImports,
    replacements,
    replacedUrls: icssReplacedUrls,
    urlHandler: (url: string) =>
      stringifyRequest(
        this,
        getPreRequester(this)(options.importLoaders) + url
      ),
  })

  // This works by returned visitors are not conflicting.
  // naive workaround for composeVisitors, as we do not directly depends on lightningcss's npm pkg
  // but next-swc provides bindings
  const visitor = {
    ...urlImportVisitor,
    ...icssVisitor,
  }

  try {
    const {
      code,
      map,
      exports: moduleExports,
    } = transform({
      ...opts,
      visitor,
      cssModules: options.modules
        ? {
            pattern: process.env.__NEXT_TEST_MODE
              ? '[name]__[local]'
              : '[name]__[hash]__[local]',
          }
        : undefined,
      filename: this.resourcePath,
      code: encoder.encode(source),
      sourceMap: this.sourceMap,
      targets: getTargets({ targets: userTargets, key: ECacheKey.loader }),
      inputSourceMap:
        this.sourceMap && prevMap ? JSON.stringify(prevMap) : undefined,
      include: 1, // Features.Nesting
    })
    let cssCodeAsString = code.toString()

    if (moduleExports) {
      for (const name in moduleExports) {
        if (Object.prototype.hasOwnProperty.call(moduleExports, name)) {
          const v = moduleExports[name]
          let value = v.name
          for (const compose of v.composes) {
            value += ` ${compose.name}`
          }

          exports.push({
            name,
            value,
          })
        }
      }
    }

    if (replacedUrls.size !== 0) {
      const urlResolver = this.getResolve({
        conditionNames: ['asset'],
        mainFields: ['asset'],
        mainFiles: [],
        extensions: [],
      })

      for (const [index, url] of replacedUrls.entries()) {
        const [pathname, ,] = url.split(/(\?)?#/, 3)

        const request = requestify(pathname, this.rootContext)
        const resolvedUrl = await resolveRequests(urlResolver, this.context, [
          ...new Set([request, url]),
        ])

        for (const importItem of imports) {
          importItem.url = importItem.url.replace(
            `__NEXT_LIGHTNINGCSS_LOADER_URL_REPLACE_${index}__`,
            resolvedUrl ?? url
          )
        }
      }
    }

    if (replacedImportUrls.size !== 0) {
      const importResolver = this.getResolve({
        conditionNames: ['style'],
        extensions: ['.css'],
        mainFields: ['css', 'style', 'main', '...'],
        mainFiles: ['index', '...'],
        restrictions: [/\.css$/i],
      })

      for (const [index, url] of replacedImportUrls.entries()) {
        const [pathname, ,] = url.split(/(\?)?#/, 3)

        const request = requestify(pathname, this.rootContext)
        const resolvedUrl = await resolveRequests(
          importResolver,
          this.context,
          [...new Set([request, url])]
        )

        for (const importItem of imports) {
          importItem.url = importItem.url.replace(
            `__NEXT_LIGHTNINGCSS_LOADER_IMPORT_URL_REPLACE_${index}__`,
            resolvedUrl ?? url
          )
        }
      }
    }
    if (icssReplacedUrls.size !== 0) {
      const icssResolver = this.getResolve({
        conditionNames: ['style'],
        extensions: [],
        mainFields: ['css', 'style', 'main', '...'],
        mainFiles: ['index', '...'],
      })

      for (const [index, url] of icssReplacedUrls.entries()) {
        const [pathname, ,] = url.split(/(\?)?#/, 3)

        const request = requestify(pathname, this.rootContext)
        const resolvedUrl = await resolveRequests(icssResolver, this.context, [
          ...new Set([url, request]),
        ])

        for (const importItem of icssImports) {
          importItem.url = importItem.url.replace(
            `__NEXT_LIGHTNINGCSS_LOADER_ICSS_URL_REPLACE_${index}__`,
            resolvedUrl ?? url
          )
        }
      }
    }

    imports.push(...icssImports)

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
    console.error('lightningcss-loader error', error)
    done(error as Error)
  }
}

export const raw = true
