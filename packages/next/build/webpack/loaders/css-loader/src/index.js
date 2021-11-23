/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/
import postcss from 'postcss'

import CssSyntaxError from './CssSyntaxError'
import Warning from '../../postcss-loader/src/Warning'
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
} from './utils'
import { stringifyRequest } from '../../../stringify-request'

export default async function loader(content, map, meta) {
  const rawOptions = this.getOptions()

  const plugins = []
  const callback = this.async()

  const loaderSpan = this.currentTraceSpan.traceChild('css-loader')

  loaderSpan
    .traceAsyncFn(async () => {
      let options

      try {
        options = normalizeOptions(rawOptions, this)
      } catch (error) {
        throw error
      }

      const replacements = []
      const exports = []

      if (shouldUseModulesPlugins(options)) {
        plugins.push(...getModulesPlugins(options, this))
      }

      const importPluginImports = []
      const importPluginApi = []

      if (shouldUseImportPlugin(options)) {
        const resolver = this.getResolve({
          conditionNames: ['style'],
          extensions: ['.css'],
          mainFields: ['css', 'style', 'main', '...'],
          mainFiles: ['index', '...'],
          restrictions: [/\.css$/i],
        })

        plugins.push(
          importParser({
            imports: importPluginImports,
            api: importPluginApi,
            context: this.context,
            rootContext: this.rootContext,
            filter: getFilter(options.import, this.resourcePath),
            resolver,
            urlHandler: (url) =>
              stringifyRequest(
                this,
                getPreRequester(this)(options.importLoaders) + url
              ),
          })
        )
      }

      const urlPluginImports = []

      if (shouldUseURLPlugin(options)) {
        const urlResolver = this.getResolve({
          conditionNames: ['asset'],
          mainFields: ['asset'],
          mainFiles: [],
          extensions: [],
        })

        plugins.push(
          urlParser({
            imports: urlPluginImports,
            replacements,
            context: this.context,
            rootContext: this.rootContext,
            filter: getFilter(options.url, this.resourcePath),
            resolver: urlResolver,
            urlHandler: (url) => stringifyRequest(this, url),
          })
        )
      }

      const icssPluginImports = []
      const icssPluginApi = []

      if (shouldUseIcssPlugin(options)) {
        const icssResolver = this.getResolve({
          conditionNames: ['style'],
          extensions: [],
          mainFields: ['css', 'style', 'main', '...'],
          mainFiles: ['index', '...'],
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
                getPreRequester(this)(options.importLoaders) + url
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
          loaderSpan.setAttribute('astUsed', 'true')
        }
      }

      const { resourcePath } = this

      let result

      try {
        result = await postcss(plugins).process(content, {
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
          importName: '___CSS_LOADER_API_IMPORT___',
          url: stringifyRequest(this, require.resolve('./runtime/api')),
        })
      }

      const importCode = getImportCode(imports, options)
      const moduleCode = getModuleCode(result, api, replacements, options, this)
      const exportCode = getExportCode(exports, replacements, options)

      return `${importCode}${moduleCode}${exportCode}`
    })
    .then(
      (code) => {
        callback(null, code)
      },
      (err) => {
        callback(err)
      }
    )
}
