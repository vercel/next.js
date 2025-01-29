/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra

  Forked to add support for `ignoreList`.
  Keep in sync with packages/next/webpack-plugins/eval-source-map-dev-tool-plugin.js
  */
// eslint-disable-next-line import/no-extraneous-dependencies -- this is a dev-only file
const ConcatenatedModule = require('webpack/lib/optimize/ConcatenatedModule')
// eslint-disable-next-line import/no-extraneous-dependencies -- this is a dev-only file
const { makePathsAbsolute } = require('webpack/lib/util/identifier')
// eslint-disable-next-line import/no-extraneous-dependencies -- this is a dev-only file
const ModuleFilenameHelpers = require('webpack/lib/ModuleFilenameHelpers')
// eslint-disable-next-line import/no-extraneous-dependencies -- this is a dev-only file
const NormalModule = require('webpack/lib/NormalModule')
// eslint-disable-next-line import/no-extraneous-dependencies -- this is a dev-only file
const RuntimeGlobals = require('webpack/lib/RuntimeGlobals')
// eslint-disable-next-line import/no-extraneous-dependencies -- this is a dev-only file
const SourceMapDevToolModuleOptionsPlugin = require('webpack/lib/SourceMapDevToolModuleOptionsPlugin')

const cache = new WeakMap()
const devtoolWarningMessage = `/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
`

// @ts-expect-error -- can't compare `string` with `number` in `version`Ï

// Fork of webpack's EvalSourceMapDevToolPlugin with support for adding `ignoreList`.
// https://github.com/webpack/webpack/blob/e237b580e2bda705c5ab39973f786f7c5a7026bc/lib/EvalSourceMapDevToolPlugin.js#L37
module.exports = class EvalSourceMapDevToolPlugin {
  sourceMapComment
  moduleFilenameTemplate
  namespace
  options
  shouldIgnorePath

  /**
   * @param {SourceMapDevToolPluginOptions|string} inputOptions Options object
   */
  constructor(inputOptions) {
    let options
    if (typeof inputOptions === 'string') {
      options = {
        append: inputOptions,
      }
    } else {
      options = inputOptions
    }
    this.sourceMapComment =
      options.append && typeof options.append !== 'function'
        ? options.append
        : '//# sourceURL=[module]\n//# sourceMappingURL=[url]'
    this.moduleFilenameTemplate =
      options.moduleFilenameTemplate ||
      'webpack://[namespace]/[resource-path]?[hash]'
    this.namespace = options.namespace || ''
    this.options = options

    // fork
    this.shouldIgnorePath = options.shouldIgnorePath ?? (() => false)
  }

  /**
   * Apply the plugin
   * @param compiler the compiler instance
   */
  apply(compiler) {
    const options = this.options
    compiler.hooks.compilation.tap(
      'NextJSEvalSourceMapDevToolPlugin',
      (compilation) => {
        const { JavascriptModulesPlugin } = compiler.webpack.javascript
        const { RawSource, ConcatSource } = compiler.webpack.sources
        const devtoolWarning = new RawSource(devtoolWarningMessage)
        const hooks = JavascriptModulesPlugin.getCompilationHooks(compilation)
        new SourceMapDevToolModuleOptionsPlugin(options).apply(compilation)
        const matchModule = ModuleFilenameHelpers.matchObject.bind(
          ModuleFilenameHelpers,
          options
        )
        hooks.renderModuleContent.tap(
          'NextJSEvalSourceMapDevToolPlugin',
          (source, m, { chunk, runtimeTemplate, chunkGraph }) => {
            const cachedSource = cache.get(source)
            if (cachedSource !== undefined) {
              return cachedSource
            }
            const result = (r) => {
              cache.set(source, r)
              return r
            }
            if (m instanceof NormalModule) {
              const module = m
              if (!matchModule(module.resource)) {
                return result(source)
              }
            } else if (m instanceof ConcatenatedModule) {
              const concatModule = m
              if (concatModule.rootModule instanceof NormalModule) {
                const module = concatModule.rootModule
                if (!matchModule(module.resource)) {
                  return result(source)
                }
              } else {
                return result(source)
              }
            } else {
              return result(source)
            }
            const namespace = compilation.getPath(this.namespace, {
              chunk,
            })
            let sourceMap
            let content
            if (source.sourceAndMap) {
              const sourceAndMap = source.sourceAndMap(options)
              sourceMap = sourceAndMap.map
              content = sourceAndMap.source
            } else {
              sourceMap = source.map(options)
              content = source.source()
            }
            if (!sourceMap) {
              return result(source)
            }

            // Clone (flat) the sourcemap to ensure that the mutations below do not persist.
            sourceMap = {
              ...sourceMap,
            }
            const context = compiler.options.context
            const root = compiler.root
            const modules = sourceMap.sources.map((sourceMapSource) => {
              if (!sourceMapSource.startsWith('webpack://'))
                return sourceMapSource
              sourceMapSource = makePathsAbsolute(
                context,
                sourceMapSource.slice(10),
                root
              )
              const module = compilation.findModule(sourceMapSource)
              return module || sourceMapSource
            })
            let moduleFilenames = modules.map((module) =>
              ModuleFilenameHelpers.createFilename(
                module,
                {
                  moduleFilenameTemplate: this.moduleFilenameTemplate,
                  namespace,
                },
                {
                  requestShortener: runtimeTemplate.requestShortener,
                  chunkGraph,
                  hashFunction: compilation.outputOptions.hashFunction,
                }
              )
            )
            moduleFilenames = ModuleFilenameHelpers.replaceDuplicates(
              moduleFilenames,
              (filename, _i, n) => {
                for (let j = 0; j < n; j++) filename += '*'
                return filename
              }
            )
            sourceMap.sources = moduleFilenames
            sourceMap.ignoreList = []
            for (let index = 0; index < moduleFilenames.length; index++) {
              if (this.shouldIgnorePath(moduleFilenames[index])) {
                sourceMap.ignoreList.push(index)
              }
            }
            if (options.noSources) {
              sourceMap.sourcesContent = undefined
            }
            sourceMap.sourceRoot = options.sourceRoot || ''
            const moduleId = /** @type {ModuleId} */ chunkGraph.getModuleId(m)
            if (moduleId) {
              sourceMap.file =
                typeof moduleId === 'number' ? `${moduleId}.js` : moduleId
            }
            const footer = `${this.sourceMapComment.replace(/\[url\]/g, `data:application/json;charset=utf-8;base64,${Buffer.from(JSON.stringify(sourceMap), 'utf8').toString('base64')}`)}\n//# sourceURL=webpack-internal:///${moduleId}\n` // workaround for chrome bug

            return result(
              new RawSource(
                `eval(${compilation.outputOptions.trustedTypes ? `${RuntimeGlobals.createScript}(${JSON.stringify(content + footer)})` : JSON.stringify(content + footer)});`
              )
            )
          }
        )
        hooks.inlineInRuntimeBailout.tap(
          'EvalDevToolModulePlugin',
          () => 'the eval-source-map devtool is used.'
        )
        hooks.render.tap(
          'EvalSourceMapDevToolPlugin',
          (source) => new ConcatSource(devtoolWarning, source)
        )
        hooks.chunkHash.tap('EvalSourceMapDevToolPlugin', (_chunk, hash) => {
          hash.update('EvalSourceMapDevToolPlugin')
          hash.update('2')
        })
        if (compilation.outputOptions.trustedTypes) {
          compilation.hooks.additionalModuleRuntimeRequirements.tap(
            'EvalSourceMapDevToolPlugin',
            (_module, set, _context) => {
              set.add(RuntimeGlobals.createScript)
            }
          )
        }
      }
    )
  }
}
