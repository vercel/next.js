import path from 'path'
import Module from 'module'

import { klona } from 'klona/full'

const parentModule = module

function exec(code, loaderContext) {
  const { resource, context } = loaderContext

  const module = new Module(resource, parentModule)

  // eslint-disable-next-line no-underscore-dangle
  module.paths = Module._nodeModulePaths(context)
  module.filename = resource

  // eslint-disable-next-line no-underscore-dangle
  module._compile(code, resource)

  return module.exports
}

function loadPlugin(plugin, options, file) {
  try {
    if (!options || Object.keys(options).length === 0) {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const loadedPlugin = require(plugin)

      if (loadedPlugin.default) {
        return loadedPlugin.default
      }

      return loadedPlugin
    }

    // eslint-disable-next-line global-require, import/no-dynamic-require
    const loadedPlugin = require(plugin)

    if (loadedPlugin.default) {
      return loadedPlugin.default(options)
    }

    return loadedPlugin(options)
  } catch (error) {
    throw new Error(
      `Loading PostCSS "${plugin}" plugin failed: ${error.message}\n\n(@${file})`
    )
  }
}

function pluginFactory() {
  const listOfPlugins = new Map()

  return (plugins) => {
    if (typeof plugins === 'undefined') {
      return listOfPlugins
    }

    if (Array.isArray(plugins)) {
      for (const plugin of plugins) {
        if (Array.isArray(plugin)) {
          const [name, options] = plugin

          listOfPlugins.set(name, options)
        } else if (plugin && typeof plugin === 'function') {
          listOfPlugins.set(plugin)
        } else if (
          plugin &&
          Object.keys(plugin).length === 1 &&
          (typeof plugin[Object.keys(plugin)[0]] === 'object' ||
            typeof plugin[Object.keys(plugin)[0]] === 'boolean') &&
          plugin[Object.keys(plugin)[0]] !== null
        ) {
          const [name] = Object.keys(plugin)
          const options = plugin[name]

          if (options === false) {
            listOfPlugins.delete(name)
          } else {
            listOfPlugins.set(name, options)
          }
        } else if (plugin) {
          listOfPlugins.set(plugin)
        }
      }
    } else {
      const objectPlugins = Object.entries(plugins)

      for (const [name, options] of objectPlugins) {
        if (options === false) {
          listOfPlugins.delete(name)
        } else {
          listOfPlugins.set(name, options)
        }
      }
    }

    return listOfPlugins
  }
}

async function load(module) {
  let exports

  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    exports = require(module)

    return exports
  } catch (requireError) {
    let importESM

    try {
      // eslint-disable-next-line no-new-func
      importESM = new Function('id', 'return import(id);')
    } catch (e) {
      importESM = null
    }

    if (requireError.code === 'ERR_REQUIRE_ESM' && importESM) {
      exports = await importESM(module)

      return exports.default
    }

    throw requireError
  }
}

async function getPostcssOptions(
  loaderContext,
  loadedConfig = {},
  postcssOptions = {}
) {
  const file = loaderContext.resourcePath

  let normalizedPostcssOptions = postcssOptions

  if (typeof normalizedPostcssOptions === 'function') {
    normalizedPostcssOptions = normalizedPostcssOptions(loaderContext)
  }

  let plugins = []

  try {
    const factory = pluginFactory()

    if (loadedConfig.config && loadedConfig.config.plugins) {
      factory(loadedConfig.config.plugins)
    }

    factory(normalizedPostcssOptions.plugins)

    plugins = [...factory()].map((item) => {
      const [plugin, options] = item

      if (typeof plugin === 'string') {
        return loadPlugin(plugin, options, file)
      }

      return plugin
    })
  } catch (error) {
    loaderContext.emitError(error)
  }

  const processOptionsFromConfig = loadedConfig.config || {}

  if (processOptionsFromConfig.from) {
    processOptionsFromConfig.from = path.resolve(
      path.dirname(loadedConfig.filepath),
      processOptionsFromConfig.from
    )
  }

  if (processOptionsFromConfig.to) {
    processOptionsFromConfig.to = path.resolve(
      path.dirname(loadedConfig.filepath),
      processOptionsFromConfig.to
    )
  }

  // No need them for processOptions
  delete processOptionsFromConfig.plugins

  const processOptionsFromOptions = klona(normalizedPostcssOptions)

  if (processOptionsFromOptions.from) {
    processOptionsFromOptions.from = path.resolve(
      loaderContext.rootContext,
      processOptionsFromOptions.from
    )
  }

  if (processOptionsFromOptions.to) {
    processOptionsFromOptions.to = path.resolve(
      loaderContext.rootContext,
      processOptionsFromOptions.to
    )
  }

  // No need them for processOptions
  delete processOptionsFromOptions.config
  delete processOptionsFromOptions.plugins

  const processOptions = {
    from: file,
    to: file,
    map: false,
    ...processOptionsFromConfig,
    ...processOptionsFromOptions,
  }

  if (typeof processOptions.parser === 'string') {
    try {
      processOptions.parser = await load(processOptions.parser)
    } catch (error) {
      loaderContext.emitError(
        new Error(
          `Loading PostCSS "${processOptions.parser}" parser failed: ${error.message}\n\n(@${file})`
        )
      )
    }
  }

  if (typeof processOptions.stringifier === 'string') {
    try {
      processOptions.stringifier = await load(processOptions.stringifier)
    } catch (error) {
      loaderContext.emitError(
        new Error(
          `Loading PostCSS "${processOptions.stringifier}" stringifier failed: ${error.message}\n\n(@${file})`
        )
      )
    }
  }

  if (typeof processOptions.syntax === 'string') {
    try {
      processOptions.syntax = await load(processOptions.syntax)
    } catch (error) {
      loaderContext.emitError(
        new Error(
          `Loading PostCSS "${processOptions.syntax}" syntax failed: ${error.message}\n\n(@${file})`
        )
      )
    }
  }

  if (processOptions.map === true) {
    // https://github.com/postcss/postcss/blob/master/docs/source-maps.md
    processOptions.map = { inline: true }
  }

  return { plugins, processOptions }
}

const IS_NATIVE_WIN32_PATH = /^[a-z]:[/\\]|^\\\\/i
const ABSOLUTE_SCHEME = /^[a-z0-9+\-.]+:/i

function getURLType(source) {
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

function normalizeSourceMap(map, resourceContext) {
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
    newMap.sources = newMap.sources.map((source) => {
      const sourceType = getURLType(source)

      // Do no touch `scheme-relative` and `absolute` URLs
      if (sourceType === 'path-relative' || sourceType === 'path-absolute') {
        const absoluteSource =
          sourceType === 'path-relative' && sourceRoot
            ? path.resolve(sourceRoot, path.normalize(source))
            : path.normalize(source)

        return path.relative(resourceContext, absoluteSource)
      }

      return source
    })
  }

  return newMap
}

function normalizeSourceMapAfterPostcss(map, resourceContext) {
  const newMap = map

  // result.map.file is an optional property that provides the output filename.
  // Since we don't know the final filename in the webpack build chain yet, it makes no sense to have it.
  // eslint-disable-next-line no-param-reassign
  delete newMap.file

  // eslint-disable-next-line no-param-reassign
  newMap.sourceRoot = ''

  // eslint-disable-next-line no-param-reassign
  newMap.sources = newMap.sources.map((source) => {
    if (source.indexOf('<') === 0) {
      return source
    }

    const sourceType = getURLType(source)

    // Do no touch `scheme-relative`, `path-absolute` and `absolute` types
    if (sourceType === 'path-relative') {
      return path.resolve(resourceContext, source)
    }

    return source
  })

  return newMap
}

export {
  getPostcssOptions,
  exec,
  normalizeSourceMap,
  normalizeSourceMapAfterPostcss,
}
