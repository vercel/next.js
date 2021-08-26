/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/

import postcss from 'postcss'

import CssSyntaxError from './CssSyntaxError'
import Warning from './Warning'
import { icssParser, importParser, urlParser } from './plugins'
import {
  normalizeOptions,
  shouldUseModulesPlugins,
  shouldUseImportPlugin,
  shouldUseURLPlugin,
  shouldUseIcssPlugin,
  getPreRequester,
  getExportCode,
  getFilter,
  getImportCode,
  getModuleCode,
  getModulesPlugins,
  normalizeSourceMap,
  sort,
  combineRequests,
  stringifyRequest,
} from './utils'

export default async function loader(content, map, meta) {
  const loaderSpan = this.currentTraceSpan.traceChild('css-loader')
  const callback = this.async()

  loaderSpan
    .traceAsyncFn(async () => {
      const rawOptions = this.getOptions()
      const plugins = []

      const options = normalizeOptions(rawOptions, this)

      const replacements = []
      const exports = []

      if (shouldUseModulesPlugins(options)) {
        plugins.push(...getModulesPlugins(options, this))
      }

      const importPluginImports = []
      const importPluginApi = []

      if (shouldUseImportPlugin(options)) {
        const resolver = this.getResolve({
          dependencyType: 'css',
          conditionNames: ['style'],
          mainFields: ['css', 'style', 'main', '...'],
          mainFiles: ['index', '...'],
          extensions: ['.css', '...'],
          preferRelative: true,
        })

        plugins.push(
          importParser({
            imports: importPluginImports,
            api: importPluginApi,
            context: this.context,
            rootContext: this.rootContext,
            resourcePath: this.resourcePath,
            filter: getFilter(options.import.filter, this.resourcePath),
            resolver,
            urlHandler: (url) =>
              stringifyRequest(
                this,
                combineRequests(
                  getPreRequester(this)(options.importLoaders),
                  url
                )
              ),
          })
        )
      }

      const urlPluginImports = []

      if (shouldUseURLPlugin(options)) {
        const needToResolveURL = !options.esModule
        const isSupportDataURLInNewURL =
          options.esModule && Boolean('fsStartTime' in this._compiler)

        plugins.push(
          urlParser({
            imports: urlPluginImports,
            replacements,
            context: this.context,
            rootContext: this.rootContext,
            filter: getFilter(options.url.filter, this.resourcePath),
            needToResolveURL,
            resolver: needToResolveURL
              ? this.getResolve({ mainFiles: [], extensions: [] })
              : // eslint-disable-next-line no-undefined
                undefined,
            urlHandler: (url) => stringifyRequest(this, url),
            // Support data urls as input in new URL added in webpack@5.38.0
            isSupportDataURLInNewURL,
          })
        )
      }

      const icssPluginImports = []
      const icssPluginApi = []

      const needToUseIcssPlugin = shouldUseIcssPlugin(options)

      if (needToUseIcssPlugin) {
        const icssResolver = this.getResolve({
          dependencyType: 'icss',
          conditionNames: ['style'],
          extensions: ['...'],
          mainFields: ['css', 'style', 'main', '...'],
          mainFiles: ['index', '...'],
          preferRelative: true,
        })

        plugins.push(
          icssParser({
            imports: icssPluginImports,
            api: icssPluginApi,
            replacements,
            exports,
            context: this.context,
            rootContext: this.rootContext,
            resolver: icssResolver,
            urlHandler: (url) =>
              stringifyRequest(
                this,
                combineRequests(
                  getPreRequester(this)(options.importLoaders),
                  url
                )
              ),
          })
        )
      }

      // Reuse CSS AST (PostCSS AST e.g 'postcss-loader') to avoid reparsing
      if (meta) {
        const { ast } = meta

        if (ast && ast.type === 'postcss') {
          // eslint-disable-next-line no-param-reassign
          content = ast.root
        }
      }

      const { resourcePath } = this

      let result

      try {
        result = await postcss(plugins).process(content, {
          hideNothingWarning: true,
          from: resourcePath,
          to: resourcePath,
          map: options.sourceMap
            ? {
                prev: map ? normalizeSourceMap(map, resourcePath) : null,
                inline: false,
                annotation: false,
              }
            : false,
        })
      } catch (error) {
        if (error.file) {
          this.addDependency(error.file)
        }

        throw error.name === 'CssSyntaxError'
          ? new CssSyntaxError(error)
          : error
      }

      for (const warning of result.warnings()) {
        this.emitWarning(new Warning(warning))
      }

      const imports = []
        .concat(icssPluginImports.sort(sort))
        .concat(importPluginImports.sort(sort))
        .concat(urlPluginImports.sort(sort))
      const api = []
        .concat(importPluginApi.sort(sort))
        .concat(icssPluginApi.sort(sort))

      if (options.modules.exportOnlyLocals !== true) {
        imports.unshift({
          type: 'api_import',
          importName: '___CSS_LOADER_API_IMPORT___',
          url: stringifyRequest(this, require.resolve('./runtime/api')),
        })

        if (options.sourceMap) {
          imports.unshift({
            type: 'api_sourcemap_import',
            importName: '___CSS_LOADER_API_SOURCEMAP_IMPORT___',
            url: stringifyRequest(
              this,
              require.resolve('./runtime/cssWithMappingToString')
            ),
          })
        }
      }

      const importCode = getImportCode(imports, options)

      let moduleCode = getModuleCode(result, api, replacements, options, this)

      const exportCode = getExportCode(
        exports,
        replacements,
        needToUseIcssPlugin,
        options
      )

      return `${importCode}${moduleCode}${exportCode}`
    })
    .then(
      (code) => callback?.(null, code),
      (err) => {
        callback?.(err)
      }
    )
}
