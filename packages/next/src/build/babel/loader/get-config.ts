import { readFileSync } from 'node:fs'
import { inspect } from 'node:util'
import JSON5 from 'next/dist/compiled/json5'

import { createConfigItem, loadOptions } from 'next/dist/compiled/babel/core'
import loadFullConfig from 'next/dist/compiled/babel/core-lib-config'

import type {
  NextBabelLoaderOptionDefaultPresets,
  NextBabelLoaderOptions,
  NextJsLoaderContext,
} from './types'
import {
  consumeIterator,
  type SourceMap,
  type BabelLoaderTransformOptions,
} from './util'
import * as Log from '../../output/log'
import { isReactCompilerRequired } from '../../swc'

/**
 * An internal (non-exported) type used by babel.
 */
export type ResolvedBabelConfig = {
  options: BabelLoaderTransformOptions
  passes: BabelPluginPasses
  externalDependencies: ReadonlyArray<string>
}

export type BabelPlugin = unknown
export type BabelPluginPassList = ReadonlyArray<BabelPlugin>
export type BabelPluginPasses = ReadonlyArray<BabelPluginPassList>

const nextDistPath =
  /(next[\\/]dist[\\/]shared[\\/]lib)|(next[\\/]dist[\\/]client)|(next[\\/]dist[\\/]pages)/

/**
 * The properties defined here are the conditions with which subsets of inputs
 * can be identified that are able to share a common Babel config.  For example,
 * in dev mode, different transforms must be applied to a source file depending
 * on whether you're compiling for the client or for the server - thus `isServer`
 * is germane.
 *
 * However, these characteristics need not protect against circumstances that
 * will not be encountered in Next.js.  For example, a source file may be
 * transformed differently depending on whether we're doing a production compile
 * or for HMR in dev mode.  However, those two circumstances will never be
 * encountered within the context of a single V8 context (and, thus, shared
 * cache).  Therefore, hasReactRefresh is _not_ germane to caching.
 *
 * NOTE: This approach does not support multiple `.babelrc` files in a
 * single project.  A per-cache-key config will be generated once and,
 * if `.babelrc` is present, that config will be used for any subsequent
 * transformations.
 */
interface CharacteristicsGermaneToCaching {
  isStandalone: boolean
  isServer: boolean | undefined
  isPageFile: boolean | undefined
  isNextDist: boolean
  hasModuleExports: boolean
  hasReactCompiler: boolean
  fileExt: string
  configFilePath: string | undefined
}

function shouldSkipBabel(
  transformMode: 'standalone' | 'default',
  configFilePath: string | undefined,
  hasReactCompiler: boolean
) {
  return (
    transformMode === 'standalone' &&
    configFilePath == null &&
    !hasReactCompiler
  )
}

const fileExtensionRegex = /\.([a-z]+)$/
async function getCacheCharacteristics(
  loaderOptions: NextBabelLoaderOptions,
  source: string,
  filename: string
): Promise<CharacteristicsGermaneToCaching> {
  let isStandalone, isServer, pagesDir
  switch (loaderOptions.transformMode) {
    case 'default':
      isStandalone = false
      isServer = loaderOptions.isServer
      pagesDir = loaderOptions.pagesDir
      break
    case 'standalone':
      isStandalone = true
      break
    default:
      throw new Error(
        `unsupported transformMode in loader options: ${inspect(loaderOptions)}`
      )
  }

  const isPageFile = pagesDir != null && filename.startsWith(pagesDir)
  const isNextDist = nextDistPath.test(filename)
  const hasModuleExports = source.indexOf('module.exports') !== -1
  const fileExt = fileExtensionRegex.exec(filename)?.[1] || 'unknown'

  let {
    reactCompilerPlugins,
    reactCompilerExclude,
    configFile: configFilePath,
    transformMode,
  } = loaderOptions

  // Compute `hasReactCompiler` as part of the cache characteristics / key,
  // rather than inside of `getFreshConfig`:
  // - `isReactCompilerRequired` depends on the file contents
  // - `node_modules` and `reactCompilerExclude` depend on the file path, which
  //   isn't part of the cache characteristics
  let hasReactCompiler =
    reactCompilerPlugins != null &&
    reactCompilerPlugins.length !== 0 &&
    !loaderOptions.isServer &&
    !/[/\\]node_modules[/\\]/.test(filename) &&
    // Assumption: `reactCompilerExclude` is cheap because it should only
    // operate on the file path and *not* the file contents (it's sync)
    !reactCompilerExclude?.(filename)

  // `isReactCompilerRequired` is expensive to run (parses/visits with SWC), so
  // only run it if there's a good chance we might be able to skip calling Babel
  // entirely (speculatively call `shouldSkipBabel`).
  //
  // Otherwise, we can let react compiler handle this logic for us. It should
  // behave equivalently.
  if (
    hasReactCompiler &&
    shouldSkipBabel(transformMode, configFilePath, /*hasReactCompiler*/ false)
  ) {
    hasReactCompiler &&= await isReactCompilerRequired(filename)
  }

  return {
    isStandalone,
    isServer,
    isPageFile,
    isNextDist,
    hasModuleExports,
    hasReactCompiler,
    fileExt,
    configFilePath,
  }
}

/**
 * Return an array of Babel plugins, conditioned upon loader options and
 * source file characteristics.
 */
function getPlugins(
  loaderOptions: NextBabelLoaderOptionDefaultPresets,
  cacheCharacteristics: CharacteristicsGermaneToCaching
) {
  const { isServer, isPageFile, isNextDist, hasModuleExports } =
    cacheCharacteristics

  const { development, hasReactRefresh } = loaderOptions

  const applyCommonJsItem = hasModuleExports
    ? createConfigItem(
        require('../plugins/commonjs') as typeof import('../plugins/commonjs'),
        { type: 'plugin' }
      )
    : null
  const reactRefreshItem = hasReactRefresh
    ? createConfigItem(
        [
          require('next/dist/compiled/react-refresh/babel') as typeof import('next/dist/compiled/react-refresh/babel'),
          { skipEnvCheck: true },
        ],
        { type: 'plugin' }
      )
    : null
  const pageConfigItem =
    !isServer && isPageFile
      ? createConfigItem(
          [
            require('../plugins/next-page-config') as typeof import('../plugins/next-page-config'),
          ],
          {
            type: 'plugin',
          }
        )
      : null
  const disallowExportAllItem =
    !isServer && isPageFile
      ? createConfigItem(
          [
            require('../plugins/next-page-disallow-re-export-all-exports') as typeof import('../plugins/next-page-disallow-re-export-all-exports'),
          ],
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
  const commonJsItem = isNextDist
    ? createConfigItem(
        require('next/dist/compiled/babel/plugin-transform-modules-commonjs') as typeof import('next/dist/compiled/babel/plugin-transform-modules-commonjs'),
        { type: 'plugin' }
      )
    : null
  const nextFontUnsupported = createConfigItem(
    [
      require('../plugins/next-font-unsupported') as typeof import('../plugins/next-font-unsupported'),
    ],
    { type: 'plugin' }
  )

  return [
    reactRefreshItem,
    pageConfigItem,
    disallowExportAllItem,
    applyCommonJsItem,
    transformDefineItem,
    nextSsgItem,
    commonJsItem,
    nextFontUnsupported,
  ].filter(Boolean)
}

const isJsonFile = /\.(json|babelrc)$/
const isJsFile = /\.js$/

/**
 * While this function does block execution while reading from disk, it
 * should not introduce any issues.  The function is only invoked when
 * generating a fresh config, and only a small handful of configs should
 * be generated during compilation.
 */
function getCustomBabelConfig(configFilePath: string) {
  if (isJsonFile.exec(configFilePath)) {
    const babelConfigRaw = readFileSync(configFilePath, 'utf8')
    return JSON5.parse(babelConfigRaw)
  } else if (isJsFile.exec(configFilePath)) {
    return require(configFilePath)
  }
  throw new Error(
    'The Next.js Babel loader does not support .mjs or .cjs config files.'
  )
}

let babelConfigWarned = false
/**
 * Check if custom babel configuration from user only contains options that
 * can be migrated into latest Next.js features supported by SWC.
 *
 * This raises soft warning messages only, not making any errors yet.
 */
function checkCustomBabelConfigDeprecation(
  config: Record<string, any> | undefined
) {
  if (!config || Object.keys(config).length === 0) {
    return
  }

  const { plugins, presets, ...otherOptions } = config
  if (Object.keys(otherOptions ?? {}).length > 0) {
    return
  }

  if (babelConfigWarned) {
    return
  }

  babelConfigWarned = true

  const isPresetReadyToDeprecate =
    !presets ||
    presets.length === 0 ||
    (presets.length === 1 && presets[0] === 'next/babel')
  const pluginReasons = []
  const unsupportedPlugins = []

  if (Array.isArray(plugins)) {
    for (const plugin of plugins) {
      const pluginName = Array.isArray(plugin) ? plugin[0] : plugin

      // [NOTE]: We cannot detect if the user uses babel-plugin-macro based transform plugins,
      // such as `styled-components/macro` in here.
      switch (pluginName) {
        case 'styled-components':
        case 'babel-plugin-styled-components':
          pluginReasons.push(
            `\t- 'styled-components' can be enabled via 'compiler.styledComponents' in 'next.config.js'`
          )
          break
        case '@emotion/babel-plugin':
          pluginReasons.push(
            `\t- '@emotion/babel-plugin' can be enabled via 'compiler.emotion' in 'next.config.js'`
          )
          break
        case 'babel-plugin-relay':
          pluginReasons.push(
            `\t- 'babel-plugin-relay' can be enabled via 'compiler.relay' in 'next.config.js'`
          )
          break
        case 'react-remove-properties':
          pluginReasons.push(
            `\t- 'react-remove-properties' can be enabled via 'compiler.reactRemoveProperties' in 'next.config.js'`
          )
          break
        case 'transform-remove-console':
          pluginReasons.push(
            `\t- 'transform-remove-console' can be enabled via 'compiler.removeConsole' in 'next.config.js'`
          )
          break
        default:
          unsupportedPlugins.push(pluginName)
          break
      }
    }
  }

  if (isPresetReadyToDeprecate && unsupportedPlugins.length === 0) {
    Log.warn(
      `It looks like there is a custom Babel configuration that can be removed${
        pluginReasons.length > 0 ? ':' : '.'
      }`
    )

    if (pluginReasons.length > 0) {
      Log.warn(`Next.js supports the following features natively: `)
      Log.warn(pluginReasons.join(''))
      Log.warn(
        `For more details configuration options, please refer https://nextjs.org/docs/architecture/nextjs-compiler#supported-features`
      )
    }
  }
}

/**
 * Generate a new, flat Babel config, ready to be handed to Babel-traverse.
 * This config should have no unresolved overrides, presets, etc.
 *
 * The config returned by this function is cached, so the function should not
 * depend on file-specific configuration or configuration that could change
 * across invocations without a process restart.
 */
async function getFreshConfig(
  ctx: NextJsLoaderContext,
  cacheCharacteristics: CharacteristicsGermaneToCaching,
  loaderOptions: NextBabelLoaderOptions,
  target: string
): Promise<ResolvedBabelConfig | null> {
  const { transformMode } = loaderOptions
  const { hasReactCompiler, configFilePath, fileExt } = cacheCharacteristics

  let customConfig = configFilePath && getCustomBabelConfig(configFilePath)
  if (shouldSkipBabel(transformMode, configFilePath, hasReactCompiler)) {
    // Optimization: There's nothing useful to do, bail out and skip babel on
    // this file
    return null
  }

  checkCustomBabelConfigDeprecation(customConfig)

  // We can assume that `reactCompilerPlugins` does not change without a process
  // restart (it's safe to cache), as it's specified in the `next.config.js`,
  // which always causes a full restart of `next dev` if changed.
  const reactCompilerPluginsIfEnabled = hasReactCompiler
    ? (loaderOptions.reactCompilerPlugins ?? [])
    : []

  let isServer, pagesDir, srcDir, development
  if (transformMode === 'default') {
    isServer = loaderOptions.isServer
    pagesDir = loaderOptions.pagesDir
    srcDir = loaderOptions.srcDir
    development = loaderOptions.development
  }

  let options: BabelLoaderTransformOptions = {
    babelrc: false,
    cloneInputAst: false,

    // Use placeholder file info. `updateBabelConfigWithFileDetails` will
    // replace this after caching.
    filename: `basename.${fileExt}`,
    inputSourceMap: undefined,
    sourceFileName: `basename.${fileExt}`,

    // Set the default sourcemap behavior based on Webpack's mapping flag,
    // but allow users to override if they want.
    sourceMaps:
      loaderOptions.sourceMaps === undefined
        ? ctx.sourceMap
        : loaderOptions.sourceMaps,
  }

  const baseCaller = {
    name: 'next-babel-turbo-loader',
    supportsStaticESM: true,
    supportsDynamicImport: true,

    // Provide plugins with insight into webpack target.
    // https://github.com/babel/babel-loader/issues/787
    target,

    // Webpack 5 supports TLA behind a flag. We enable it by default
    // for Babel, and then webpack will throw an error if the experimental
    // flag isn't enabled.
    supportsTopLevelAwait: true,

    isServer,
    srcDir,
    pagesDir,
    isDev: development,

    transformMode,

    ...loaderOptions.caller,
  }

  options.plugins = [
    ...(transformMode === 'default'
      ? getPlugins(loaderOptions, cacheCharacteristics)
      : []),
    ...reactCompilerPluginsIfEnabled,
    ...(customConfig?.plugins || []),
  ]

  // target can be provided in babelrc
  options.target = isServer ? undefined : customConfig?.target

  // env can be provided in babelrc
  options.env = customConfig?.env

  options.presets = (() => {
    // If presets is defined the user will have next/babel in their babelrc
    if (customConfig?.presets) {
      return customConfig.presets
    }

    // If presets is not defined the user will likely have "env" in their babelrc
    if (customConfig) {
      return undefined
    }

    // If no custom config is provided the default is to use next/babel
    return ['next/babel']
  })()

  options.overrides = loaderOptions.overrides

  options.caller = {
    ...baseCaller,
    hasJsxRuntime:
      transformMode === 'default' ? loaderOptions.hasJsxRuntime : undefined,
  }

  // Babel does strict checks on the config so undefined is not allowed
  if (typeof options.target === 'undefined') {
    delete options.target
  }

  Object.defineProperty(options.caller, 'onWarning', {
    enumerable: false,
    writable: false,
    value: (reason: any) => {
      if (!(reason instanceof Error)) {
        reason = new Error(reason)
      }
      ctx.emitWarning(reason)
    },
  })

  const loadedOptions = loadOptions(options)
  const config = consumeIterator(loadFullConfig(loadedOptions))

  return config
}

/**
 * Each key returned here corresponds with a Babel config that can be shared.
 * The conditions of permissible sharing between files is dependent on specific
 * file attributes and Next.js compiler states: `CharacteristicsGermaneToCaching`.
 */
function getCacheKey(cacheCharacteristics: CharacteristicsGermaneToCaching) {
  const {
    isStandalone,
    isServer,
    isPageFile,
    isNextDist,
    hasModuleExports,
    hasReactCompiler,
    fileExt,
    configFilePath,
  } = cacheCharacteristics

  const flags =
    0 |
    (isStandalone ? 0b000001 : 0) |
    (isServer ? 0b000010 : 0) |
    (isPageFile ? 0b000100 : 0) |
    (isNextDist ? 0b001000 : 0) |
    (hasModuleExports ? 0b010000 : 0) |
    (hasReactCompiler ? 0b100000 : 0)

  // separate strings with null bytes, assuming null bytes are not valid in file
  // paths
  return `${configFilePath || ''}\x00${fileExt}\x00${flags}`
}

const configCache: Map<any, ResolvedBabelConfig | null> = new Map()
const configFiles: Set<string> = new Set()

/**
 * Applies file-specific values to a potentially-cached configuration object.
 */
function updateBabelConfigWithFileDetails(
  cachedConfig: ResolvedBabelConfig | null | undefined,
  loaderOptions: NextBabelLoaderOptions,
  filename: string,
  inputSourceMap: SourceMap | undefined
): ResolvedBabelConfig | null {
  if (cachedConfig == null) {
    return null
  }
  return {
    ...cachedConfig,
    options: {
      ...cachedConfig.options,
      cwd: loaderOptions.cwd,
      root: loaderOptions.cwd,
      filename,
      inputSourceMap,
      // Ensure that Webpack will get a full absolute path in the sourcemap
      // so that it can properly map the module back to its internal cached
      // modules.
      sourceFileName: filename,
    },
  }
}

export default async function getConfig(
  ctx: NextJsLoaderContext,
  {
    source,
    target,
    loaderOptions,
    filename,
    inputSourceMap,
  }: {
    source: string
    loaderOptions: NextBabelLoaderOptions
    target: string
    filename: string
    inputSourceMap?: SourceMap | undefined
  }
): Promise<ResolvedBabelConfig | null> {
  const cacheCharacteristics = await getCacheCharacteristics(
    loaderOptions,
    source,
    filename
  )

  if (loaderOptions.configFile) {
    // Ensures webpack invalidates the cache for this loader when the config file changes
    ctx.addDependency(loaderOptions.configFile)
  }

  const cacheKey = getCacheKey(cacheCharacteristics)
  const cachedConfig = configCache.get(cacheKey)
  if (cachedConfig !== undefined) {
    return updateBabelConfigWithFileDetails(
      cachedConfig,
      loaderOptions,
      filename,
      inputSourceMap
    )
  }

  if (loaderOptions.configFile && !configFiles.has(loaderOptions.configFile)) {
    configFiles.add(loaderOptions.configFile)
    Log.info(
      `Using external babel configuration from ${loaderOptions.configFile}`
    )
  }

  const freshConfig = await getFreshConfig(
    ctx,
    cacheCharacteristics,
    loaderOptions,
    target
  )

  configCache.set(cacheKey, freshConfig)

  return updateBabelConfigWithFileDetails(
    freshConfig,
    loaderOptions,
    filename,
    inputSourceMap
  )
}
