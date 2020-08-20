import NativeModule from 'module'

import loaderUtils from 'loader-utils'
import webpack from 'webpack'
import NodeTargetPlugin from 'webpack/lib/node/NodeTargetPlugin'

import CssDependency from './CssDependency'

const pluginName = 'mini-css-extract-plugin'

function evalModuleCode(loaderContext, code, filename) {
  const module = new NativeModule(filename, loaderContext)

  module.paths = NativeModule._nodeModulePaths(loaderContext.context) // eslint-disable-line no-underscore-dangle
  module.filename = filename
  module._compile(code, filename) // eslint-disable-line no-underscore-dangle

  return module.exports
}

function findModuleById(modules, id) {
  for (const module of modules) {
    if (module.id === id) {
      return module
    }
  }

  return null
}

export function pitch(request) {
  const options = loaderUtils.getOptions(this) || {}

  const loaders = this.loaders.slice(this.loaderIndex + 1)

  this.addDependency(this.resourcePath)

  const childFilename = '*'
  const publicPath =
    typeof options.publicPath === 'string'
      ? options.publicPath === '' || options.publicPath.endsWith('/')
        ? options.publicPath
        : `${options.publicPath}/`
      : typeof options.publicPath === 'function'
      ? options.publicPath(this.resourcePath, this.rootContext)
      : this._compilation.outputOptions.publicPath
  const outputOptions = {
    filename: childFilename,
    publicPath,
  }
  const childCompiler = this._compilation.createChildCompiler(
    `${pluginName} ${request}`,
    outputOptions
  )

  new webpack.node.NodeTemplatePlugin(outputOptions).apply(childCompiler)
  new webpack.LibraryTemplatePlugin(null, 'commonjs2').apply(childCompiler)
  new NodeTargetPlugin().apply(childCompiler)
  new webpack.SingleEntryPlugin(this.context, `!!${request}`, pluginName).apply(
    childCompiler
  )
  new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }).apply(
    childCompiler
  )

  childCompiler.hooks.thisCompilation.tap(
    `${pluginName} loader`,
    (compilation) => {
      compilation.hooks.normalModuleLoader.tap(
        `${pluginName} loader`,
        (loaderContext, module) => {
          // eslint-disable-next-line no-param-reassign
          loaderContext.emitFile = this.emitFile

          if (module.request === request) {
            // eslint-disable-next-line no-param-reassign
            module.loaders = loaders.map((loader) => {
              return {
                loader: loader.path,
                options: loader.options,
                ident: loader.ident,
              }
            })
          }
        }
      )
    }
  )

  let source

  childCompiler.hooks.afterCompile.tap(pluginName, (compilation) => {
    source =
      compilation.assets[childFilename] &&
      compilation.assets[childFilename].source()

    // Remove all chunk assets
    compilation.chunks.forEach((chunk) => {
      chunk.files.forEach((file) => {
        delete compilation.assets[file] // eslint-disable-line no-param-reassign
      })
    })
  })

  const callback = this.async()

  childCompiler.runAsChild((err, entries, compilation) => {
    const addDependencies = (dependencies) => {
      if (!Array.isArray(dependencies) && dependencies != null) {
        throw new Error(
          `Exported value was not extracted as an array: ${JSON.stringify(
            dependencies
          )}`
        )
      }

      const identifierCountMap = new Map()

      for (const dependency of dependencies) {
        const count = identifierCountMap.get(dependency.identifier) || 0

        this._module.addDependency(
          new CssDependency(dependency, dependency.context, count)
        )
        identifierCountMap.set(dependency.identifier, count + 1)
      }
    }

    if (err) {
      return callback(err)
    }

    if (compilation.errors.length > 0) {
      return callback(compilation.errors[0])
    }

    compilation.fileDependencies.forEach((dep) => {
      this.addDependency(dep)
    }, this)

    compilation.contextDependencies.forEach((dep) => {
      this.addContextDependency(dep)
    }, this)

    if (!source) {
      return callback(new Error("Didn't get a result from child compiler"))
    }

    let locals

    try {
      let dependencies
      let exports = evalModuleCode(this, source, request)
      // eslint-disable-next-line no-underscore-dangle
      exports = exports.__esModule ? exports.default : exports
      locals = exports && exports.locals
      if (!Array.isArray(exports)) {
        dependencies = [[null, exports]]
      } else {
        dependencies = exports.map(([id, content, media, sourceMap]) => {
          const module = findModuleById(compilation.modules, id)

          return {
            identifier: module.identifier(),
            context: module.context,
            content,
            media,
            sourceMap,
          }
        })
      }
      addDependencies(dependencies)
    } catch (e) {
      return callback(e)
    }

    const esModule =
      typeof options.esModule !== 'undefined' ? options.esModule : false
    const result = locals
      ? `\n${esModule ? 'export default' : 'module.exports ='} ${JSON.stringify(
          locals
        )};`
      : esModule
      ? `\nexport {};`
      : ''

    let resultSource = `// extracted by ${pluginName}`

    resultSource += result

    return callback(null, resultSource)
  })
}

export default function () {}
