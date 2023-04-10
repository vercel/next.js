import type { webpack } from 'next/dist/compiled/webpack/webpack'
import chalk from 'next/dist/compiled/chalk'
import formatWebpackMessages from '../../client/dev/error-overlay/format-webpack-messages'
import { nonNullable } from '../../lib/non-nullable'
import {
  COMPILER_NAMES,
  CLIENT_STATIC_FILES_RUNTIME_MAIN_APP,
  APP_CLIENT_INTERNALS,
  PHASE_PRODUCTION_BUILD,
  COMPILER_INDEXES,
} from '../../shared/lib/constants'
import { runCompiler } from '../compiler'
import * as Log from '../output/log'
import getBaseWebpackConfig, { loadProjectInfo } from '../webpack-config'
import { NextError } from '../../lib/is-error'
import { TelemetryPlugin } from '../webpack/plugins/telemetry-plugin'
import {
  NextBuildContext,
  resumePluginState,
  getPluginState,
} from '../build-context'
import { createEntrypoints } from '../entries'
import loadConfig from '../../server/config'
import { trace } from '../../trace'
import { WEBPACK_LAYERS } from '../../lib/constants'
import {
  TraceEntryPointsPlugin,
  TurbotraceContext,
} from '../webpack/plugins/next-trace-entrypoints-plugin'
import { UnwrapPromise } from '../../lib/coalesced-function'
import * as pagesPluginModule from '../webpack/plugins/pages-manifest-plugin'

import origDebug from 'next/dist/compiled/debug'

const debug = origDebug('next:build:webpack-build')

type CompilerResult = {
  errors: webpack.StatsError[]
  warnings: webpack.StatsError[]
  stats: (webpack.Stats | undefined)[]
}

type SingleCompilerResult = {
  errors: webpack.StatsError[]
  warnings: webpack.StatsError[]
  stats: webpack.Stats | undefined
}

function isTelemetryPlugin(plugin: unknown): plugin is TelemetryPlugin {
  return plugin instanceof TelemetryPlugin
}

function isTraceEntryPointsPlugin(
  plugin: unknown
): plugin is TraceEntryPointsPlugin {
  return plugin instanceof TraceEntryPointsPlugin
}

export async function webpackBuildImpl(
  compilerName?: keyof typeof COMPILER_INDEXES
): Promise<{
  duration: number
  pluginState: any
  turbotraceContext?: TurbotraceContext
  serializedPagesManifestEntries?: typeof NextBuildContext['serializedPagesManifestEntries']
}> {
  let result: CompilerResult | null = {
    warnings: [],
    errors: [],
    stats: [],
  }
  let webpackBuildStart
  const nextBuildSpan = NextBuildContext.nextBuildSpan!
  const dir = NextBuildContext.dir!
  const config = NextBuildContext.config!

  const runWebpackSpan = nextBuildSpan.traceChild('run-webpack-compiler')
  const entrypoints = await nextBuildSpan
    .traceChild('create-entrypoints')
    .traceAsyncFn(() =>
      createEntrypoints({
        buildId: NextBuildContext.buildId!,
        config: config,
        envFiles: NextBuildContext.loadedEnvFiles!,
        isDev: false,
        rootDir: dir,
        pageExtensions: config.pageExtensions!,
        pagesDir: NextBuildContext.pagesDir!,
        appDir: NextBuildContext.appDir!,
        pages: NextBuildContext.mappedPages!,
        appPaths: NextBuildContext.mappedAppPages!,
        previewMode: NextBuildContext.previewProps!,
        rootPaths: NextBuildContext.mappedRootPaths!,
        hasInstrumentationHook: NextBuildContext.hasInstrumentationHook!,
      })
    )

  const commonWebpackOptions = {
    isServer: false,
    buildId: NextBuildContext.buildId!,
    config: config,
    appDir: NextBuildContext.appDir!,
    pagesDir: NextBuildContext.pagesDir!,
    rewrites: NextBuildContext.rewrites!,
    originalRewrites: NextBuildContext.originalRewrites,
    originalRedirects: NextBuildContext.originalRedirects,
    reactProductionProfiling: NextBuildContext.reactProductionProfiling!,
    noMangling: NextBuildContext.noMangling!,
    clientRouterFilters: NextBuildContext.clientRouterFilters!,
  }

  const configs = await runWebpackSpan
    .traceChild('generate-webpack-config')
    .traceAsyncFn(async () => {
      const info = await loadProjectInfo({
        dir,
        config: commonWebpackOptions.config,
        dev: false,
      })
      return Promise.all([
        getBaseWebpackConfig(dir, {
          ...commonWebpackOptions,
          middlewareMatchers: entrypoints.middlewareMatchers,
          runWebpackSpan,
          compilerType: COMPILER_NAMES.client,
          entrypoints: entrypoints.client,
          ...info,
        }),
        getBaseWebpackConfig(dir, {
          ...commonWebpackOptions,
          runWebpackSpan,
          middlewareMatchers: entrypoints.middlewareMatchers,
          compilerType: COMPILER_NAMES.server,
          entrypoints: entrypoints.server,
          ...info,
        }),
        getBaseWebpackConfig(dir, {
          ...commonWebpackOptions,
          runWebpackSpan,
          middlewareMatchers: entrypoints.middlewareMatchers,
          compilerType: COMPILER_NAMES.edgeServer,
          entrypoints: entrypoints.edgeServer,
          ...info,
        }),
      ])
    })

  const clientConfig = configs[0]
  const serverConfig = configs[1]

  if (
    clientConfig.optimization &&
    (clientConfig.optimization.minimize !== true ||
      (clientConfig.optimization.minimizer &&
        clientConfig.optimization.minimizer.length === 0))
  ) {
    Log.warn(
      `Production code optimization has been disabled in your project. Read more: https://nextjs.org/docs/messages/minification-disabled`
    )
  }

  webpackBuildStart = process.hrtime()

  debug(`starting compiler`, compilerName)
  // We run client and server compilation separately to optimize for memory usage
  await runWebpackSpan.traceAsyncFn(async () => {
    // Run the server compilers first and then the client
    // compiler to track the boundary of server/client components.
    let clientResult: SingleCompilerResult | null = null

    // During the server compilations, entries of client components will be
    // injected to this set and then will be consumed by the client compiler.
    let serverResult: UnwrapPromise<ReturnType<typeof runCompiler>> | null =
      null
    let edgeServerResult: UnwrapPromise<ReturnType<typeof runCompiler>> | null =
      null

    if (!compilerName || compilerName === 'server') {
      serverResult = await runCompiler(serverConfig, {
        runWebpackSpan,
      })
      debug('server result', serverResult)
    }

    if (!compilerName || compilerName === 'edge-server') {
      edgeServerResult = configs[2]
        ? await runCompiler(configs[2], { runWebpackSpan })
        : null
      debug('edge server result', edgeServerResult)
    }

    // Only continue if there were no errors
    if (!serverResult?.errors.length && !edgeServerResult?.errors.length) {
      const pluginState = getPluginState()
      for (const key in pluginState.injectedClientEntries) {
        const value = pluginState.injectedClientEntries[key]
        const clientEntry = clientConfig.entry as webpack.EntryObject
        if (key === APP_CLIENT_INTERNALS) {
          clientEntry[CLIENT_STATIC_FILES_RUNTIME_MAIN_APP] = {
            import: [
              // TODO-APP: cast clientEntry[CLIENT_STATIC_FILES_RUNTIME_MAIN_APP] to type EntryDescription once it's available from webpack
              // @ts-expect-error clientEntry['main-app'] is type EntryDescription { import: ... }
              ...clientEntry[CLIENT_STATIC_FILES_RUNTIME_MAIN_APP].import,
              value,
            ],
            layer: WEBPACK_LAYERS.appClient,
          }
        } else {
          clientEntry[key] = {
            dependOn: [CLIENT_STATIC_FILES_RUNTIME_MAIN_APP],
            import: value,
            layer: WEBPACK_LAYERS.appClient,
          }
        }
      }

      if (!compilerName || compilerName === 'client') {
        clientResult = await runCompiler(clientConfig, {
          runWebpackSpan,
        })
        debug('client result', clientResult)
      }
    }

    result = {
      warnings: ([] as any[])
        .concat(
          clientResult?.warnings,
          serverResult?.warnings,
          edgeServerResult?.warnings
        )
        .filter(nonNullable),
      errors: ([] as any[])
        .concat(
          clientResult?.errors,
          serverResult?.errors,
          edgeServerResult?.errors
        )
        .filter(nonNullable),
      stats: [
        clientResult?.stats,
        serverResult?.stats,
        edgeServerResult?.stats,
      ],
    }
  })
  result = nextBuildSpan
    .traceChild('format-webpack-messages')
    .traceFn(() => formatWebpackMessages(result, true)) as CompilerResult

  NextBuildContext.telemetryPlugin = (
    clientConfig as webpack.Configuration
  ).plugins?.find(isTelemetryPlugin)

  const traceEntryPointsPlugin = (
    serverConfig as webpack.Configuration
  ).plugins?.find(isTraceEntryPointsPlugin)

  const webpackBuildEnd = process.hrtime(webpackBuildStart)

  if (result.errors.length > 0) {
    // Only keep the first few errors. Others are often indicative
    // of the same problem, but confuse the reader with noise.
    if (result.errors.length > 5) {
      result.errors.length = 5
    }
    let error = result.errors.filter(Boolean).join('\n\n')

    console.error(chalk.red('Failed to compile.\n'))

    if (
      error.indexOf('private-next-pages') > -1 &&
      error.indexOf('does not contain a default export') > -1
    ) {
      const page_name_regex = /'private-next-pages\/(?<page_name>[^']*)'/
      const parsed = page_name_regex.exec(error)
      const page_name = parsed && parsed.groups && parsed.groups.page_name
      throw new Error(
        `webpack build failed: found page without a React Component as default export in pages/${page_name}\n\nSee https://nextjs.org/docs/messages/page-without-valid-component for more info.`
      )
    }

    console.error(error)
    console.error()

    if (
      error.indexOf('private-next-pages') > -1 ||
      error.indexOf('__next_polyfill__') > -1
    ) {
      const err = new Error(
        'webpack config.resolve.alias was incorrectly overridden. https://nextjs.org/docs/messages/invalid-resolve-alias'
      ) as NextError
      err.code = 'INVALID_RESOLVE_ALIAS'
      throw err
    }
    const err = new Error('Build failed because of webpack errors') as NextError
    err.code = 'WEBPACK_ERRORS'
    throw err
  } else {
    if (result.warnings.length > 0) {
      Log.warn('Compiled with warnings\n')
      console.warn(result.warnings.filter(Boolean).join('\n\n'))
      console.warn()
    } else if (!compilerName) {
      NextBuildContext.buildSpinner?.stopAndPersist()
      Log.info('Compiled successfully')
    }

    return {
      duration: webpackBuildEnd[0],
      turbotraceContext: traceEntryPointsPlugin?.turbotraceContext,
      pluginState: getPluginState(),
      serializedPagesManifestEntries: {
        edgeServerPages: pagesPluginModule.edgeServerPages,
        edgeServerAppPaths: pagesPluginModule.edgeServerAppPaths,
        nodeServerPages: pagesPluginModule.nodeServerPages,
        nodeServerAppPaths: pagesPluginModule.nodeServerAppPaths,
      },
    }
  }
}

// the main function when this file is run as a worker
export async function workerMain(workerData: {
  compilerName: keyof typeof COMPILER_INDEXES
  buildContext: typeof NextBuildContext
}) {
  // setup new build context from the serialized data passed from the parent
  Object.assign(NextBuildContext, workerData.buildContext)

  // Resume plugin state
  resumePluginState(NextBuildContext.pluginState)

  // restore module scope maps for flight plugins
  const { serializedPagesManifestEntries } = NextBuildContext

  for (const key of Object.keys(serializedPagesManifestEntries || {})) {
    Object.assign(
      (pagesPluginModule as any)[key],
      (serializedPagesManifestEntries as any)?.[key]
    )
  }

  /// load the config because it's not serializable
  NextBuildContext.config = await loadConfig(
    PHASE_PRODUCTION_BUILD,
    NextBuildContext.dir!,
    undefined,
    undefined,
    true
  )
  NextBuildContext.nextBuildSpan = trace('next-build')

  const result = await webpackBuildImpl(workerData.compilerName)
  const { entriesTrace } = result.turbotraceContext ?? {}
  if (entriesTrace) {
    const { entryNameMap, depModArray } = entriesTrace
    if (depModArray) {
      result.turbotraceContext!.entriesTrace!.depModArray = depModArray
    }
    if (entryNameMap) {
      const entryEntries = Array.from(entryNameMap?.entries() ?? [])
      // @ts-expect-error
      result.turbotraceContext.entriesTrace.entryNameMap = entryEntries
    }
  }
  return result
}
