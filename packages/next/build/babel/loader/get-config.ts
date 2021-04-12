import { createConfigItem, loadOptions } from 'next/dist/compiled/babel/core'
import loadConfig from 'next/dist/compiled/babel/core-lib-config'

import nextBabelPreset from '../preset'
import { NextBabelLoaderOptions, NextJsLoaderContext } from './types'
import { consumeIterator, LruCache } from './util'

const nextDistPath = /(next[\\/]dist[\\/]next-server[\\/]lib)|(next[\\/]dist[\\/]client)|(next[\\/]dist[\\/]pages)/

function getPlugins(
  loaderOptions: NextBabelLoaderOptions,
  source: string,
  filename: string
) {
  const { hasReactRefresh, isServer, development, pagesDir } = loaderOptions
  const isPageFile = filename.startsWith(pagesDir)

  const applyCommonJsItem =
    source.indexOf('module.exports') === -1
      ? null
      : createConfigItem(require('../plugins/commonjs'), { type: 'plugin' })
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

const configs = new LruCache()
export default function getConfig(
  this: NextJsLoaderContext,
  {
    source,
    loaderOptions,
    inputSourceMap,
    target,
    filename,
  }: {
    source: string
    loaderOptions: NextBabelLoaderOptions
    inputSourceMap?: object | null
    target: string
    filename: string
  }
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
  const configKey = `${isServer ? 'server' : 'client'}:${filename}`

  if (configs.has(configKey)) {
    return configs.get(configKey)
  }

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

  configs.set(configKey, config)

  return config
}
