import { default as nextBabelPreset } from 'next/babel'
import { createConfigItem, loadOptions } from '@babel/core'
import loadConfig from '@babel/core/lib/config'

import { consumeIterator } from './util'

function getPlugins(loaderOptions, source, filename) {
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

  return [
    noAnonymousDefaultExportItem,
    reactRefreshItem,
    // TODO: should next/babel preset's plugins be inserted here?
    pageConfigItem,
    disallowExportAllItem,
    applyCommonJsItem,
    transformDefineItem,
    nextSsgItem,
  ].filter(Boolean)
}

function getOverrides(overrides = []) {
  const commonJsItem = createConfigItem(
    require('next/dist/compiled/babel/plugin-transform-modules-commonjs'),
    { type: 'plugin' }
  )

  return [
    ...overrides,
    {
      test: [
        /next[\\/]dist[\\/]next-server[\\/]lib/,
        /next[\\/]dist[\\/]client/,
        /next[\\/]dist[\\/]pages/,
      ],
      plugins: [commonJsItem],
    },
  ]
}

export default function getConfig({
  source,
  loaderOptions,
  inputSourceMap,
  target,
  filename,
}) {
  const {
    presets = [],
    isServer,
    pagesDir,
    development,
    hasReactRefresh,
    hasJsxRuntime,
  } = loaderOptions

  const nextPresetItem = createConfigItem(nextBabelPreset, { type: 'preset' })

  let options = {
    babelrc: false,
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

    overrides: getOverrides(loaderOptions.overrides),

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
  }

  // TODO: Document what `onWarning` is for.
  Object.defineProperty(options.caller, 'onWarning', {
    enumerable: false,
    writable: false,
    value: (reason) => {
      if (!(reason instanceof Error)) {
        reason = new Error(reason)
      }
      this.emitWarning(reason)
    },
  })

  options = loadOptions(options)
  const config = consumeIterator(loadConfig(options))

  return config
}
