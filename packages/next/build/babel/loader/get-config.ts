import { createConfigItem, loadOptions } from 'next/dist/compiled/babel/core'
import loadConfig from 'next/dist/compiled/babel/core-lib-config'

import nextBabelPreset from '../preset'
import { NextBabelLoaderOptions, NextJsLoaderContext } from './types'
import { consumeIterator } from './util'

const nextDistPath = /(next[\\/]dist[\\/]next-server[\\/]lib)|(next[\\/]dist[\\/]client)|(next[\\/]dist[\\/]pages)/

/**
 * Return an array of Babel plugins, conditioned upon loader options and
 * source file characteristics.
 */
function getPlugins(
  loaderOptions: NextBabelLoaderOptions,
  source: string,
  filename: string
) {
  const { hasReactRefresh, isServer, development, pagesDir } = loaderOptions
  const isPageFile = filename.startsWith(pagesDir)
  const hasModuleExports = source.indexOf('module.exports') !== -1

  const applyCommonJsItem = hasModuleExports
    ? createConfigItem(require('../plugins/commonjs'), { type: 'plugin' })
    : null
  const reactRefreshItem = hasReactRefresh
    ? createConfigItem(
        [require('react-refresh/babel'), { skipEnvCheck: true }],
        { type: 'plugin' }
      )
    : null
  const noAnonymousDefaultExportItem =
    hasReactRefresh && !isServer
      ? createConfigItem(
          [require('../plugins/no-anonymous-default-export'), {}],
          { type: 'plugin' }
        )
      : null
  const pageConfigItem =
    !isServer && isPageFile
      ? createConfigItem([require('../plugins/next-page-config')], {
          type: 'plugin',
        })
      : null
  const disallowExportAllItem =
    !isServer && isPageFile
      ? createConfigItem(
          [require('../plugins/next-page-disallow-re-export-all-exports')],
          { type: 'plugin' }
        )
      : null
  const transformDefineItem = createConfigItem(
    [
      require.resolve('next/dist/compiled/babel/plugin-transform-define'),
      {
        'process.env.NODE_ENV': development ? 'development' : 'production',
        'typeof window': isServer ? 'undefined' : 'object',
        'process.browser': isServer ? false : true,
      },
      'next-js-transform-define-instance',
    ],
    { type: 'plugin' }
  )
  const nextSsgItem =
    !isServer && isPageFile
      ? createConfigItem([require.resolve('../plugins/next-ssg-transform')], {
          type: 'plugin',
        })
      : null
  const commonJsItem = nextDistPath.test(filename)
    ? createConfigItem(
        require('next/dist/compiled/babel/plugin-transform-modules-commonjs'),
        { type: 'plugin' }
      )
    : null

  return [
    noAnonymousDefaultExportItem,
    reactRefreshItem,
    pageConfigItem,
    disallowExportAllItem,
    applyCommonJsItem,
    transformDefineItem,
    nextSsgItem,
    commonJsItem,
  ].filter(Boolean)
}

/**
 * Generate a new, flat Babel config, ready to be handed to Babel traverse.
 * This config should have resolved all overrides, presets, etc.
 */
function getFreshConfig(
  this: NextJsLoaderContext,
  source: string,
  loaderOptions: NextBabelLoaderOptions,
  target: string,
  filename: string,
  inputSourceMap?: object | null
) {
  const {
    presets = [],
    isServer,
    pagesDir,
    development,
    hasReactRefresh,
    hasJsxRuntime,
    hasBabelRc,
  } = loaderOptions
  const nextPresetItem = createConfigItem(nextBabelPreset, { type: 'preset' })

  let options = {
    babelrc: hasBabelRc,
    cloneInputAst: false,
    filename,
    inputSourceMap: inputSourceMap || undefined,

    // Set the default sourcemap behavior based on Webpack's mapping flag,
    // but allow users to override if they want.
    sourceMaps:
      loaderOptions.sourceMaps === undefined
        ? inputSourceMap
        : loaderOptions.sourceMaps,

    // Ensure that Webpack will get a full absolute path in the sourcemap
    // so that it can properly map the module back to its internal cached
    // modules.
    sourceFileName: filename,

    plugins: getPlugins(loaderOptions, source, filename),

    presets: [...presets, nextPresetItem],

    overrides: loaderOptions.overrides,

    caller: {
      name: 'next-babel-turbo-loader',
      supportsStaticESM: true,
      supportsDynamicImport: true,

      // Provide plugins with insight into webpack target.
      // https://github.com/babel/babel-loader/issues/787
      target: target,

      // Webpack 5 supports TLA behind a flag. We enable it by default
      // for Babel, and then webpack will throw an error if the experimental
      // flag isn't enabled.
      supportsTopLevelAwait: true,

      isServer,
      pagesDir,
      development,
      hasReactRefresh,
      hasJsxRuntime,

      ...loaderOptions.caller,
    },
  } as any

  Object.defineProperty(options.caller, 'onWarning', {
    enumerable: false,
    writable: false,
    value: (reason: any) => {
      if (!(reason instanceof Error)) {
        reason = new Error(reason)
      }
      this.emitWarning(reason)
    },
  })

  const loadedOptions = loadOptions(options)
  const config = consumeIterator(loadConfig(loadedOptions))

  return config
}

/**
 * Each key returned here corresponds with a Babel config that can be shared.
 * The conditions of permissible sharing between files is dependent on specific
 * file attributes and Next.js compiler states.
 *
 * If it is possible for `getFreshConfig` to return a config that is unique to
 * some aspects of that file, `getCacheKey` _must_ return a unique key. However,
 * the key must be unique only to a specific V8 isolate - the cache key need
 * not be unique to separate processes or worker threads.
 *
 * NOTE: This function does not support multiple `.babelrc` files in a
 * single project.  A per-cache-key config will be generated once and,
 * if `.babelrc` is present, that config will be used for any subsequent
 * transformations.
 */
function getCacheKey(
  loaderOptions: NextBabelLoaderOptions,
  source: string,
  filename: string
) {
  const { isServer, pagesDir } = loaderOptions
  const isPageFile = filename.startsWith(pagesDir)
  const isNextDist = nextDistPath.test(filename)
  const hasModuleExports = source.indexOf('module.exports') !== -1

  return (
    0 |
    (isServer ? 0b0001 : 0) |
    (isPageFile ? 0b0010 : 0) |
    (isNextDist ? 0b0100 : 0) |
    (hasModuleExports ? 0b1000 : 0)
  )
}

type BabelConfig = any
const configCache: Map<number, BabelConfig> = new Map()

export default function getConfig(
  this: NextJsLoaderContext,
  {
    source,
    loaderOptions,
    target,
    filename,
    inputSourceMap,
  }: {
    source: string
    loaderOptions: NextBabelLoaderOptions
    target: string
    filename: string
    inputSourceMap?: object | null
  }
): BabelConfig {
  const cacheKey = getCacheKey(loaderOptions, source, filename)
  if (configCache.has(cacheKey)) {
    return {
      ...configCache.get(cacheKey),
      filename,
      sourceFileName: filename,
    }
  }

  const freshConfig = getFreshConfig.call(
    this,
    source,
    loaderOptions,
    target,
    filename,
    inputSourceMap
  )

  configCache.set(cacheKey, freshConfig)

  return freshConfig
}
