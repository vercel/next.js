import type {
  Endpoint,
  Route,
  TurbopackResult,
  WrittenEndpoint,
  Issue,
  StyledString,
} from '../../build/swc'
import type { Socket } from 'net'
import type { OutputState } from '../../build/output/store'
import type { BuildManifest } from '../get-page-files'
import type { PagesManifest } from '../../build/webpack/plugins/pages-manifest-plugin'
import type { AppBuildManifest } from '../../build/webpack/plugins/app-build-manifest-plugin'
import type {
  CompilationError,
  HMR_ACTION_TYPES,
  NextJsHotReloaderInterface,
  ReloadPageAction,
  SyncAction,
  TurbopackConnectedAction,
} from './hot-reloader-types'

import ws from 'next/dist/compiled/ws'
import { createDefineEnv } from '../../build/swc'
import { join } from 'path'
import * as Log from '../../build/output/log'
import {
  getVersionInfo,
  matchNextPageBundleRequest,
} from './hot-reloader-webpack'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { isInterceptionRouteRewrite } from '../../lib/generate-interception-routes-rewrites'
import { store as consoleStore } from '../../build/output/store'

import {
  APP_BUILD_MANIFEST,
  APP_PATHS_MANIFEST,
  BUILD_MANIFEST,
  MIDDLEWARE_MANIFEST,
  NEXT_FONT_MANIFEST,
  PAGES_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  INTERCEPTION_ROUTE_REWRITE_MANIFEST,
} from '../../shared/lib/constants'
import { getOverlayMiddleware } from 'next/dist/compiled/@next/react-dev-overlay/dist/middleware-turbopack'
import { mkdir, writeFile } from 'fs/promises'
import { PageNotFoundError } from '../../shared/lib/utils'
import {
  type ClientBuildManifest,
  normalizeRewritesForBuildManifest,
  srcEmptySsgManifest,
} from '../../build/webpack/plugins/build-manifest-plugin'
import { HMR_ACTIONS_SENT_TO_BROWSER } from './hot-reloader-types'
import type { Update as TurbopackUpdate } from '../../build/swc'
import { debounce } from '../utils'
import {
  deleteAppClientCache,
  deleteCache,
} from '../../build/webpack/plugins/nextjs-require-cache-hot-reloader'
import { normalizeMetadataRoute } from '../../lib/metadata/get-metadata-route'
import {
  clearModuleContext,
  clearAllModuleContexts,
} from '../lib/render-server'
import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import { denormalizePagePath } from '../../shared/lib/page-path/denormalize-page-path'
import type { LoadableManifest } from '../load-components'
import { bold, green, magenta, red } from '../../lib/picocolors'
import { writeFileAtomic } from '../../lib/fs/write-atomic'
import { trace } from '../../trace'
import type { VersionInfo } from './parse-version-info'
import type { NextFontManifest } from '../../build/webpack/plugins/next-font-manifest-plugin'
import {
  MAGIC_IDENTIFIER_REGEX,
  decodeMagicIdentifier,
} from '../../shared/lib/magic-identifier'
import {
  getTurbopackJsConfig,
  mergeActionManifests,
  mergeAppBuildManifests,
  mergeBuildManifests,
  mergeFontManifests,
  mergeLoadableManifests,
  mergeMiddlewareManifests,
  mergePagesManifests,
  readPartialManifest,
  type TurbopackMiddlewareManifest,
} from './turbopack-utils'
import {
  propagateServerField,
  type ServerFields,
  type SetupOpts,
} from '../lib/router-utils/setup-dev-bundler'

const MILLISECONDS_IN_NANOSECOND = 1_000_000
const wsServer = new ws.Server({ noServer: true })
const isTestMode = !!(
  process.env.NEXT_TEST_MODE ||
  process.env.__NEXT_TEST_MODE ||
  process.env.DEBUG
)

class ModuleBuildError extends Error {}

function issueKey(issue: Issue): string {
  return [
    issue.severity,
    issue.filePath,
    JSON.stringify(issue.title),
    JSON.stringify(issue.description),
  ].join('-')
}

function formatIssue(issue: Issue) {
  const { filePath, title, description, source } = issue
  let { documentationLink } = issue
  let formattedTitle = renderStyledStringToErrorAnsi(title).replace(
    /\n/g,
    '\n    '
  )

  // TODO: Use error codes to identify these
  // TODO: Generalize adapting Turbopack errors to Next.js errors
  if (formattedTitle.includes('Module not found')) {
    // For compatiblity with webpack
    // TODO: include columns in webpack errors.
    documentationLink = 'https://nextjs.org/docs/messages/module-not-found'
  }

  let formattedFilePath = filePath
    .replace('[project]/', './')
    .replaceAll('/./', '/')
    .replace('\\\\?\\', '')

  let message

  if (source && source.range) {
    const { start } = source.range
    message = `${formattedFilePath}:${start.line + 1}:${
      start.column + 1
    }\n${formattedTitle}`
  } else if (formattedFilePath) {
    message = `${formattedFilePath}\n${formattedTitle}`
  } else {
    message = formattedTitle
  }
  message += '\n'

  if (source?.range && source.source.content) {
    const { start, end } = source.range
    const { codeFrameColumns } = require('next/dist/compiled/babel/code-frame')

    message +=
      codeFrameColumns(
        source.source.content,
        {
          start: {
            line: start.line + 1,
            column: start.column + 1,
          },
          end: {
            line: end.line + 1,
            column: end.column + 1,
          },
        },
        { forceColor: true }
      ).trim() + '\n\n'
  }

  if (description) {
    message += renderStyledStringToErrorAnsi(description) + '\n\n'
  }

  // TODO: make it possible to enable this for debugging, but not in tests.
  // if (detail) {
  //   message += renderStyledStringToErrorAnsi(detail) + '\n\n'
  // }

  // TODO: Include a trace from the issue.

  if (documentationLink) {
    message += documentationLink + '\n\n'
  }

  return message
}

type CurrentIssues = Map<string, Map<string, Issue>>

function processIssues(
  currentIssues: CurrentIssues,
  name: string,
  result: TurbopackResult,
  throwIssue = false
) {
  const newIssues = new Map<string, Issue>()
  currentIssues.set(name, newIssues)

  const relevantIssues = new Set()

  for (const issue of result.issues) {
    if (issue.severity !== 'error' && issue.severity !== 'fatal') continue
    const key = issueKey(issue)
    const formatted = formatIssue(issue)
    newIssues.set(key, issue)

    // We show errors in node_modules to the console, but don't throw for them
    if (/(^|\/)node_modules(\/|$)/.test(issue.filePath)) continue
    relevantIssues.add(formatted)
  }

  if (relevantIssues.size && throwIssue) {
    throw new ModuleBuildError([...relevantIssues].join('\n\n'))
  }
}

type BuildManifests = Map<string, BuildManifest>
type AppBuildManifests = Map<string, AppBuildManifest>
type PagesManifests = Map<string, PagesManifest>
type AppPathsManifests = Map<string, PagesManifest>
type MiddlewareManifests = Map<string, TurbopackMiddlewareManifest>
type ActionManifests = Map<string, ActionManifest>
type FontManifests = Map<string, NextFontManifest>
type LoadableManifests = Map<string, LoadableManifest>
type CurrentEntrypoints = Map<string, Route>

async function loadMiddlewareManifest(
  distDir: string,
  middlewareManifests: MiddlewareManifests,
  pageName: string,
  type: 'pages' | 'app' | 'app-route' | 'middleware' | 'instrumentation'
): Promise<void> {
  middlewareManifests.set(
    pageName,
    await readPartialManifest(distDir, MIDDLEWARE_MANIFEST, pageName, type)
  )
}

async function loadBuildManifest(
  distDir: string,
  buildManifests: BuildManifests,
  pageName: string,
  type: 'app' | 'pages' = 'pages'
): Promise<void> {
  buildManifests.set(
    pageName,
    await readPartialManifest(distDir, BUILD_MANIFEST, pageName, type)
  )
}

async function loadAppBuildManifest(
  distDir: string,
  appBuildManifests: AppBuildManifests,
  pageName: string
): Promise<void> {
  appBuildManifests.set(
    pageName,
    await readPartialManifest(distDir, APP_BUILD_MANIFEST, pageName, 'app')
  )
}

async function loadPagesManifest(
  distDir: string,
  pagesManifests: PagesManifests,
  pageName: string
): Promise<void> {
  pagesManifests.set(
    pageName,
    await readPartialManifest(distDir, PAGES_MANIFEST, pageName)
  )
}

async function loadAppPathManifest(
  distDir: string,
  appPathsManifests: AppPathsManifests,
  pageName: string,
  type: 'app' | 'app-route' = 'app'
): Promise<void> {
  appPathsManifests.set(
    pageName,
    await readPartialManifest(distDir, APP_PATHS_MANIFEST, pageName, type)
  )
}

async function loadActionManifest(
  distDir: string,
  actionManifests: ActionManifests,
  pageName: string
): Promise<void> {
  actionManifests.set(
    pageName,
    await readPartialManifest(
      distDir,
      `${SERVER_REFERENCE_MANIFEST}.json`,
      pageName,
      'app'
    )
  )
}

async function loadFontManifest(
  distDir: string,
  fontManifests: FontManifests,
  pageName: string,
  type: 'app' | 'pages' = 'pages'
): Promise<void> {
  fontManifests.set(
    pageName,
    await readPartialManifest(
      distDir,
      `${NEXT_FONT_MANIFEST}.json`,
      pageName,
      type
    )
  )
}

async function loadLoadableManifest(
  distDir: string,
  loadableManifests: LoadableManifests,
  pageName: string,
  type: 'app' | 'pages' = 'pages'
): Promise<void> {
  loadableManifests.set(
    pageName,
    await readPartialManifest(distDir, REACT_LOADABLE_MANIFEST, pageName, type)
  )
}

async function writeBuildManifest(
  distDir: string,
  buildManifests: BuildManifests,
  currentEntrypoints: CurrentEntrypoints,
  rewrites: SetupOpts['fsChecker']['rewrites']
): Promise<void> {
  const buildManifest = mergeBuildManifests(buildManifests.values())
  const buildManifestPath = join(distDir, BUILD_MANIFEST)
  const middlewareBuildManifestPath = join(
    distDir,
    'server',
    `${MIDDLEWARE_BUILD_MANIFEST}.js`
  )
  const interceptionRewriteManifestPath = join(
    distDir,
    'server',
    `${INTERCEPTION_ROUTE_REWRITE_MANIFEST}.js`
  )
  deleteCache(buildManifestPath)
  deleteCache(middlewareBuildManifestPath)
  deleteCache(interceptionRewriteManifestPath)
  await writeFileAtomic(
    buildManifestPath,
    JSON.stringify(buildManifest, null, 2)
  )
  await writeFileAtomic(
    middlewareBuildManifestPath,
    `self.__BUILD_MANIFEST=${JSON.stringify(buildManifest)};`
  )

  const interceptionRewrites = JSON.stringify(
    rewrites.beforeFiles.filter(isInterceptionRouteRewrite)
  )

  await writeFileAtomic(
    interceptionRewriteManifestPath,
    `self.__INTERCEPTION_ROUTE_REWRITE_MANIFEST=${JSON.stringify(
      interceptionRewrites
    )};`
  )

  const content: ClientBuildManifest = {
    __rewrites: rewrites
      ? (normalizeRewritesForBuildManifest(rewrites) as any)
      : { afterFiles: [], beforeFiles: [], fallback: [] },
    ...Object.fromEntries(
      [...currentEntrypoints.keys()].map((pathname) => [
        pathname,
        `static/chunks/pages${pathname === '/' ? '/index' : pathname}.js`,
      ])
    ),
    sortedPages: [...currentEntrypoints.keys()],
  }
  const buildManifestJs = `self.__BUILD_MANIFEST = ${JSON.stringify(
    content
  )};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
  await writeFileAtomic(
    join(distDir, 'static', 'development', '_buildManifest.js'),
    buildManifestJs
  )
  await writeFileAtomic(
    join(distDir, 'static', 'development', '_ssgManifest.js'),
    srcEmptySsgManifest
  )
}

async function writeFallbackBuildManifest(
  distDir: string,
  buildManifests: BuildManifests
): Promise<void> {
  const fallbackBuildManifest = mergeBuildManifests(
    [buildManifests.get('_app'), buildManifests.get('_error')].filter(
      Boolean
    ) as BuildManifest[]
  )
  const fallbackBuildManifestPath = join(distDir, `fallback-${BUILD_MANIFEST}`)
  deleteCache(fallbackBuildManifestPath)
  await writeFileAtomic(
    fallbackBuildManifestPath,
    JSON.stringify(fallbackBuildManifest, null, 2)
  )
}

async function writeAppBuildManifest(
  distDir: string,
  appBuildManifests: AppBuildManifests
): Promise<void> {
  const appBuildManifest = mergeAppBuildManifests(appBuildManifests.values())
  const appBuildManifestPath = join(distDir, APP_BUILD_MANIFEST)
  deleteCache(appBuildManifestPath)
  await writeFileAtomic(
    appBuildManifestPath,
    JSON.stringify(appBuildManifest, null, 2)
  )
}

async function writePagesManifest(
  distDir: string,
  pagesManifests: PagesManifests
): Promise<void> {
  const pagesManifest = mergePagesManifests(pagesManifests.values())
  const pagesManifestPath = join(distDir, 'server', PAGES_MANIFEST)
  deleteCache(pagesManifestPath)
  await writeFileAtomic(
    pagesManifestPath,
    JSON.stringify(pagesManifest, null, 2)
  )
}

async function writeAppPathsManifest(
  distDir: string,
  appPathsManifests: AppPathsManifests
): Promise<void> {
  const appPathsManifest = mergePagesManifests(appPathsManifests.values())
  const appPathsManifestPath = join(distDir, 'server', APP_PATHS_MANIFEST)
  deleteCache(appPathsManifestPath)
  await writeFileAtomic(
    appPathsManifestPath,
    JSON.stringify(appPathsManifest, null, 2)
  )
}

async function writeMiddlewareManifest(
  distDir: string,
  middlewareManifests: MiddlewareManifests
): Promise<void> {
  const middlewareManifest = mergeMiddlewareManifests(
    middlewareManifests.values()
  )
  const middlewareManifestPath = join(distDir, 'server', MIDDLEWARE_MANIFEST)
  deleteCache(middlewareManifestPath)
  await writeFileAtomic(
    middlewareManifestPath,
    JSON.stringify(middlewareManifest, null, 2)
  )
}

async function writeActionManifest(
  distDir: string,
  actionManifests: ActionManifests
): Promise<void> {
  const actionManifest = await mergeActionManifests(actionManifests.values())
  const actionManifestJsonPath = join(
    distDir,
    'server',
    `${SERVER_REFERENCE_MANIFEST}.json`
  )
  const actionManifestJsPath = join(
    distDir,
    'server',
    `${SERVER_REFERENCE_MANIFEST}.js`
  )
  const json = JSON.stringify(actionManifest, null, 2)
  deleteCache(actionManifestJsonPath)
  deleteCache(actionManifestJsPath)
  await writeFile(actionManifestJsonPath, json, 'utf-8')
  await writeFile(
    actionManifestJsPath,
    `self.__RSC_SERVER_MANIFEST=${JSON.stringify(json)}`,
    'utf-8'
  )
}

async function writeFontManifest(
  distDir: string,
  fontManifests: FontManifests
): Promise<void> {
  const fontManifest = mergeFontManifests(fontManifests.values())
  const json = JSON.stringify(fontManifest, null, 2)

  const fontManifestJsonPath = join(
    distDir,
    'server',
    `${NEXT_FONT_MANIFEST}.json`
  )
  const fontManifestJsPath = join(distDir, 'server', `${NEXT_FONT_MANIFEST}.js`)
  deleteCache(fontManifestJsonPath)
  deleteCache(fontManifestJsPath)
  await writeFileAtomic(fontManifestJsonPath, json)
  await writeFileAtomic(
    fontManifestJsPath,
    `self.__NEXT_FONT_MANIFEST=${JSON.stringify(json)}`
  )
}

async function writeLoadableManifest(
  distDir: string,
  loadableManifests: LoadableManifests
): Promise<void> {
  const loadableManifest = mergeLoadableManifests(loadableManifests.values())
  const loadableManifestPath = join(distDir, REACT_LOADABLE_MANIFEST)
  const middlewareloadableManifestPath = join(
    distDir,
    'server',
    `${MIDDLEWARE_REACT_LOADABLE_MANIFEST}.js`
  )

  const json = JSON.stringify(loadableManifest, null, 2)

  deleteCache(loadableManifestPath)
  deleteCache(middlewareloadableManifestPath)
  await writeFileAtomic(loadableManifestPath, json)
  await writeFileAtomic(
    middlewareloadableManifestPath,
    `self.__REACT_LOADABLE_MANIFEST=${JSON.stringify(json)}`
  )
}

async function writeManifests(
  opts: SetupOpts,
  distDir: string,
  buildManifests: BuildManifests,
  appBuildManifests: AppBuildManifests,
  pagesManifests: PagesManifests,
  appPathsManifests: AppPathsManifests,
  middlewareManifests: MiddlewareManifests,
  actionManifests: ActionManifests,
  fontManifests: FontManifests,
  loadableManifests: LoadableManifests,
  currentEntrypoints: CurrentEntrypoints
): Promise<void> {
  await writeBuildManifest(
    distDir,
    buildManifests,
    currentEntrypoints,
    opts.fsChecker.rewrites
  )
  await writeAppBuildManifest(distDir, appBuildManifests)
  await writePagesManifest(distDir, pagesManifests)
  await writeAppPathsManifest(distDir, appPathsManifests)
  await writeMiddlewareManifest(distDir, middlewareManifests)
  await writeActionManifest(distDir, actionManifests)
  await writeFontManifest(distDir, fontManifests)
  await writeLoadableManifest(distDir, loadableManifests)
  await writeFallbackBuildManifest(distDir, buildManifests)
}

export async function createHotReloaderTurbopack(
  opts: SetupOpts,
  serverFields: ServerFields,
  distDir: string
): Promise<NextJsHotReloaderInterface> {
  const { nextConfig, dir } = opts

  const { loadBindings } =
    require('../../build/swc') as typeof import('../../build/swc')

  let bindings = await loadBindings()

  // For the debugging purpose, check if createNext or equivalent next instance setup in test cases
  // works correctly. Normally `run-test` hides output so only will be visible when `--debug` flag is used.
  if (process.env.TURBOPACK && isTestMode) {
    require('console').log('Creating turbopack project', {
      dir,
      testMode: isTestMode,
    })
  }

  const hasRewrites =
    opts.fsChecker.rewrites.afterFiles.length > 0 ||
    opts.fsChecker.rewrites.beforeFiles.length > 0 ||
    opts.fsChecker.rewrites.fallback.length > 0

  const hotReloaderSpan = trace('hot-reloader', undefined, {
    version: process.env.__NEXT_VERSION as string,
  })
  // Ensure the hotReloaderSpan is flushed immediately as it's the parentSpan for all processing
  // of the current `next dev` invocation.
  hotReloaderSpan.stop()

  const project = await bindings.turbo.createProject({
    projectPath: dir,
    rootPath: opts.nextConfig.experimental.outputFileTracingRoot || dir,
    nextConfig: opts.nextConfig,
    jsConfig: await getTurbopackJsConfig(dir, nextConfig),
    watch: true,
    env: process.env as Record<string, string>,
    defineEnv: createDefineEnv({
      isTurbopack: true,
      allowedRevalidateHeaderKeys: undefined,
      clientRouterFilters: undefined,
      config: nextConfig,
      dev: true,
      distDir,
      fetchCacheKeyPrefix: undefined,
      hasRewrites,
      middlewareMatchers: undefined,
      previewModeId: undefined,
    }),
    serverAddr: `127.0.0.1:${opts.port}`,
  })
  const entrypointsSubscription = project.entrypointsSubscribe()
  const currentEntrypoints: CurrentEntrypoints = new Map()
  const changeSubscriptions: Map<
    string,
    Promise<AsyncIterator<any>>
  > = new Map()
  let prevMiddleware: boolean | undefined = undefined
  const globalEntrypoints: {
    app: Endpoint | undefined
    document: Endpoint | undefined
    error: Endpoint | undefined
  } = {
    app: undefined,
    document: undefined,
    error: undefined,
  }
  let currentEntriesHandlingResolve: ((value?: unknown) => void) | undefined
  let currentEntriesHandling = new Promise(
    (resolve) => (currentEntriesHandlingResolve = resolve)
  )
  const hmrPayloads = new Map<string, HMR_ACTION_TYPES>()
  const turbopackUpdates: TurbopackUpdate[] = []

  const currentIssues: CurrentIssues = new Map()
  const serverPathState = new Map<string, string>()

  async function handleRequireCacheClearing(
    id: string,
    result: TurbopackResult<WrittenEndpoint>
  ): Promise<TurbopackResult<WrittenEndpoint>> {
    // Figure out if the server files have changed
    let hasChange = false
    for (const { path, contentHash } of result.serverPaths) {
      // We ignore source maps
      if (path.endsWith('.map')) continue
      const key = `${id}:${path}`
      const localHash = serverPathState.get(key)
      const globalHash = serverPathState.get(path)
      if (
        (localHash && localHash !== contentHash) ||
        (globalHash && globalHash !== contentHash)
      ) {
        hasChange = true
        serverPathState.set(key, contentHash)
        serverPathState.set(path, contentHash)
      } else {
        if (!localHash) {
          serverPathState.set(key, contentHash)
        }
        if (!globalHash) {
          serverPathState.set(path, contentHash)
        }
      }
    }

    if (!hasChange) {
      return result
    }

    const hasAppPaths = result.serverPaths.some(({ path: p }) =>
      p.startsWith('server/app')
    )

    if (hasAppPaths) {
      deleteAppClientCache()
    }

    const serverPaths = result.serverPaths.map(({ path: p }) =>
      join(distDir, p)
    )

    for (const file of serverPaths) {
      clearModuleContext(file)
      deleteCache(file)
    }

    return result
  }

  const buildingIds = new Set()
  const readyIds = new Set()

  function startBuilding(
    id: string,
    requestUrl: string | undefined,
    forceRebuild: boolean = false
  ) {
    if (!forceRebuild && readyIds.has(id)) {
      return () => {}
    }
    if (buildingIds.size === 0) {
      consoleStore.setState(
        {
          loading: true,
          trigger: id,
          url: requestUrl,
        } as OutputState,
        true
      )
    }
    buildingIds.add(id)
    return function finishBuilding() {
      if (buildingIds.size === 0) {
        return
      }
      readyIds.add(id)
      buildingIds.delete(id)
      if (buildingIds.size === 0) {
        consoleStore.setState(
          {
            loading: false,
          } as OutputState,
          true
        )
      }
    }
  }

  let hmrEventHappened = false
  let hmrHash = 0
  const sendEnqueuedMessages = () => {
    for (const [, issueMap] of currentIssues) {
      if (issueMap.size > 0) {
        // During compilation errors we want to delay the HMR events until errors are fixed
        return
      }
    }
    for (const payload of hmrPayloads.values()) {
      hotReloader.send(payload)
    }
    hmrPayloads.clear()
    if (turbopackUpdates.length > 0) {
      hotReloader.send({
        action: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
        data: turbopackUpdates,
      })
      turbopackUpdates.length = 0
    }
  }
  const sendEnqueuedMessagesDebounce = debounce(sendEnqueuedMessages, 2)

  function sendHmr(id: string, payload: HMR_ACTION_TYPES) {
    hmrPayloads.set(`${id}`, payload)
    hmrEventHappened = true
    sendEnqueuedMessagesDebounce()
  }

  function sendTurbopackMessage(payload: TurbopackUpdate) {
    turbopackUpdates.push(payload)
    hmrEventHappened = true
    sendEnqueuedMessagesDebounce()
  }

  const buildManifests: BuildManifests = new Map()
  const appBuildManifests: AppBuildManifests = new Map()
  const pagesManifests: PagesManifests = new Map()
  const appPathsManifests: AppPathsManifests = new Map()
  const middlewareManifests: MiddlewareManifests = new Map()
  const actionManifests: ActionManifests = new Map()
  const fontManifests: FontManifests = new Map()
  const loadableManifests: LoadableManifests = new Map()

  const clientToHmrSubscription: Map<
    ws,
    Map<string, AsyncIterator<any>>
  > = new Map()

  const clients = new Set<ws>()

  async function changeSubscription(
    page: string,
    type: 'client' | 'server',
    includeIssues: boolean,
    endpoint: Endpoint | undefined,
    makePayload: (
      page: string,
      change: TurbopackResult
    ) => Promise<HMR_ACTION_TYPES> | HMR_ACTION_TYPES | void
  ) {
    const key = `${page} (${type})`
    if (!endpoint || changeSubscriptions.has(key)) return

    const changedPromise = endpoint[`${type}Changed`](includeIssues)
    changeSubscriptions.set(key, changedPromise)
    const changed = await changedPromise

    for await (const change of changed) {
      processIssues(currentIssues, page, change)
      const payload = await makePayload(page, change)
      if (payload) {
        sendHmr(key, payload)
      }
    }
  }

  async function clearChangeSubscription(
    page: string,
    type: 'server' | 'client'
  ) {
    const key = `${page} (${type})`
    const subscription = await changeSubscriptions.get(key)
    if (subscription) {
      subscription.return?.()
      changeSubscriptions.delete(key)
    }
    currentIssues.delete(key)
  }

  async function subscribeToHmrEvents(id: string, client: ws) {
    let mapping = clientToHmrSubscription.get(client)
    if (mapping === undefined) {
      mapping = new Map()
      clientToHmrSubscription.set(client, mapping)
    }
    if (mapping.has(id)) return

    const subscription = project!.hmrEvents(id)
    mapping.set(id, subscription)

    // The subscription will always emit once, which is the initial
    // computation. This is not a change, so swallow it.
    try {
      await subscription.next()

      for await (const data of subscription) {
        processIssues(currentIssues, id, data)
        if (data.type !== 'issues') {
          sendTurbopackMessage(data)
        }
      }
    } catch (e) {
      // The client might be using an HMR session from a previous server, tell them
      // to fully reload the page to resolve the issue. We can't use
      // `hotReloader.send` since that would force very connected client to
      // reload, only this client is out of date.
      const reloadAction: ReloadPageAction = {
        action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE,
      }
      client.send(JSON.stringify(reloadAction))
      client.close()
      return
    }
  }

  function unsubscribeToHmrEvents(id: string, client: ws) {
    const mapping = clientToHmrSubscription.get(client)
    const subscription = mapping?.get(id)
    subscription?.return!()
  }

  try {
    async function handleEntrypointsSubscription() {
      for await (const entrypoints of entrypointsSubscription) {
        if (!currentEntriesHandlingResolve) {
          currentEntriesHandling = new Promise(
            // eslint-disable-next-line no-loop-func
            (resolve) => (currentEntriesHandlingResolve = resolve)
          )
        }
        globalEntrypoints.app = entrypoints.pagesAppEndpoint
        globalEntrypoints.document = entrypoints.pagesDocumentEndpoint
        globalEntrypoints.error = entrypoints.pagesErrorEndpoint

        currentEntrypoints.clear()

        for (const [pathname, route] of entrypoints.routes) {
          switch (route.type) {
            case 'page':
            case 'page-api':
            case 'app-page':
            case 'app-route': {
              currentEntrypoints.set(pathname, route)
              break
            }
            default:
              Log.info(`skipping ${pathname} (${route.type})`)
              break
          }
        }

        for (const [pathname, subscriptionPromise] of changeSubscriptions) {
          if (pathname === '') {
            // middleware is handled below
            continue
          }

          if (!currentEntrypoints.has(pathname)) {
            const subscription = await subscriptionPromise
            subscription.return?.()
            changeSubscriptions.delete(pathname)
          }
        }

        const { middleware, instrumentation } = entrypoints
        // We check for explicit true/false, since it's initialized to
        // undefined during the first loop (middlewareChanges event is
        // unnecessary during the first serve)
        if (prevMiddleware === true && !middleware) {
          // Went from middleware to no middleware
          await clearChangeSubscription('middleware', 'server')
          sendHmr('middleware', {
            event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
          })
        } else if (prevMiddleware === false && middleware) {
          // Went from no middleware to middleware
          sendHmr('middleware', {
            event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
          })
        }
        if (
          opts.nextConfig.experimental.instrumentationHook &&
          instrumentation
        ) {
          const processInstrumentation = async (
            displayName: string,
            name: string,
            prop: 'nodeJs' | 'edge'
          ) => {
            const writtenEndpoint = await handleRequireCacheClearing(
              displayName,
              await instrumentation[prop].writeToDisk()
            )
            processIssues(currentIssues, name, writtenEndpoint)
          }
          await processInstrumentation(
            'instrumentation (node.js)',
            'instrumentation.nodeJs',
            'nodeJs'
          )
          await processInstrumentation(
            'instrumentation (edge)',
            'instrumentation.edge',
            'edge'
          )
          await loadMiddlewareManifest(
            distDir,
            middlewareManifests,
            'instrumentation',
            'instrumentation'
          )
          await writeManifests(
            opts,
            distDir,
            buildManifests,
            appBuildManifests,
            pagesManifests,
            appPathsManifests,
            middlewareManifests,
            actionManifests,
            fontManifests,
            loadableManifests,
            currentEntrypoints
          )

          serverFields.actualInstrumentationHookFile = '/instrumentation'
          await propagateServerField(
            opts,
            'actualInstrumentationHookFile',
            serverFields.actualInstrumentationHookFile
          )
        } else {
          serverFields.actualInstrumentationHookFile = undefined
          await propagateServerField(
            opts,
            'actualInstrumentationHookFile',
            serverFields.actualInstrumentationHookFile
          )
        }
        if (middleware) {
          const processMiddleware = async () => {
            const writtenEndpoint = await handleRequireCacheClearing(
              'middleware',
              await middleware.endpoint.writeToDisk()
            )
            processIssues(currentIssues, 'middleware', writtenEndpoint)
            await loadMiddlewareManifest(
              distDir,
              middlewareManifests,
              'middleware',
              'middleware'
            )
            serverFields.middleware = {
              match: null as any,
              page: '/',
              matchers:
                middlewareManifests.get('middleware')?.middleware['/'].matchers,
            }
          }
          await processMiddleware()

          changeSubscription(
            'middleware',
            'server',
            false,
            middleware.endpoint,
            async () => {
              const finishBuilding = startBuilding(
                'middleware',
                undefined,
                true
              )
              await processMiddleware()
              await propagateServerField(
                opts,
                'actualMiddlewareFile',
                serverFields.actualMiddlewareFile
              )
              await propagateServerField(
                opts,
                'middleware',
                serverFields.middleware
              )
              await writeManifests(
                opts,
                distDir,
                buildManifests,
                appBuildManifests,
                pagesManifests,
                appPathsManifests,
                middlewareManifests,
                actionManifests,
                fontManifests,
                loadableManifests,
                currentEntrypoints
              )

              finishBuilding()
              return { event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES }
            }
          )
          prevMiddleware = true
        } else {
          middlewareManifests.delete('middleware')
          serverFields.actualMiddlewareFile = undefined
          serverFields.middleware = undefined
          prevMiddleware = false
        }
        await propagateServerField(
          opts,
          'actualMiddlewareFile',
          serverFields.actualMiddlewareFile
        )
        await propagateServerField(opts, 'middleware', serverFields.middleware)

        currentEntriesHandlingResolve!()
        currentEntriesHandlingResolve = undefined
      }
    }

    handleEntrypointsSubscription().catch((err) => {
      console.error(err)
      process.exit(1)
    })
  } catch (e) {
    console.error(e)
  }

  // Write empty manifests
  await mkdir(join(distDir, 'server'), { recursive: true })
  await mkdir(join(distDir, 'static/development'), { recursive: true })
  await writeFile(
    join(distDir, 'package.json'),
    JSON.stringify(
      {
        type: 'commonjs',
      },
      null,
      2
    )
  )
  await currentEntriesHandling
  await writeManifests(
    opts,
    distDir,
    buildManifests,
    appBuildManifests,
    pagesManifests,
    appPathsManifests,
    middlewareManifests,
    actionManifests,
    fontManifests,
    loadableManifests,
    currentEntrypoints
  )
  const overlayMiddleware = getOverlayMiddleware(project)
  const versionInfo: VersionInfo = await getVersionInfo(
    isTestMode || opts.telemetry.isEnabled
  )

  async function handleRouteType(
    page: string,
    route: Route,
    requestUrl: string | undefined
  ) {
    let finishBuilding: (() => void) | undefined = undefined

    try {
      switch (route.type) {
        case 'page': {
          finishBuilding = startBuilding(page, requestUrl)
          try {
            if (globalEntrypoints.app) {
              const writtenEndpoint = await handleRequireCacheClearing(
                '_app',
                await globalEntrypoints.app.writeToDisk()
              )
              processIssues(currentIssues, '_app', writtenEndpoint)
            }
            await loadBuildManifest(distDir, buildManifests, '_app')
            await loadPagesManifest(distDir, pagesManifests, '_app')

            if (globalEntrypoints.document) {
              const writtenEndpoint = await handleRequireCacheClearing(
                '_document',
                await globalEntrypoints.document.writeToDisk()
              )
              processIssues(currentIssues, '_document', writtenEndpoint)
            }
            await loadPagesManifest(distDir, pagesManifests, '_document')

            const writtenEndpoint = await handleRequireCacheClearing(
              page,
              await route.htmlEndpoint.writeToDisk()
            )

            const type = writtenEndpoint?.type

            await loadBuildManifest(distDir, buildManifests, page)
            await loadPagesManifest(distDir, pagesManifests, page)
            if (type === 'edge') {
              await loadMiddlewareManifest(
                distDir,
                middlewareManifests,
                page,
                'pages'
              )
            } else {
              middlewareManifests.delete(page)
            }
            await loadFontManifest(distDir, fontManifests, page, 'pages')
            await loadLoadableManifest(
              distDir,
              loadableManifests,
              page,
              'pages'
            )

            await writeManifests(
              opts,
              distDir,
              buildManifests,
              appBuildManifests,
              pagesManifests,
              appPathsManifests,
              middlewareManifests,
              actionManifests,
              fontManifests,
              loadableManifests,
              currentEntrypoints
            )

            processIssues(currentIssues, page, writtenEndpoint)
          } finally {
            changeSubscription(
              page,
              'server',
              false,
              route.dataEndpoint,
              (pageName) => {
                // Report the next compilation again
                readyIds.delete(page)
                return {
                  event: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES,
                  pages: [pageName],
                }
              }
            )
            changeSubscription(
              page,
              'client',
              false,
              route.htmlEndpoint,
              () => {
                return {
                  event: HMR_ACTIONS_SENT_TO_BROWSER.CLIENT_CHANGES,
                }
              }
            )
            if (globalEntrypoints.document) {
              changeSubscription(
                '_document',
                'server',
                false,
                globalEntrypoints.document,
                () => {
                  return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
                }
              )
            }
          }

          break
        }
        case 'page-api': {
          finishBuilding = startBuilding(page, requestUrl)
          const writtenEndpoint = await handleRequireCacheClearing(
            page,
            await route.endpoint.writeToDisk()
          )

          const type = writtenEndpoint?.type

          await loadPagesManifest(distDir, pagesManifests, page)
          if (type === 'edge') {
            await loadMiddlewareManifest(
              distDir,
              middlewareManifests,
              page,
              'pages'
            )
          } else {
            middlewareManifests.delete(page)
          }
          await loadLoadableManifest(distDir, loadableManifests, page, 'pages')

          await writeManifests(
            opts,
            distDir,
            buildManifests,
            appBuildManifests,
            pagesManifests,
            appPathsManifests,
            middlewareManifests,
            actionManifests,
            fontManifests,
            loadableManifests,
            currentEntrypoints
          )

          processIssues(currentIssues, page, writtenEndpoint)

          break
        }
        case 'app-page': {
          finishBuilding = startBuilding(page, requestUrl)
          const writtenEndpoint = await handleRequireCacheClearing(
            page,
            await route.htmlEndpoint.writeToDisk()
          )

          changeSubscription(
            page,
            'server',
            true,
            route.rscEndpoint,
            (_page, change) => {
              if (change.issues.some((issue) => issue.severity === 'error')) {
                // Ignore any updates that has errors
                // There will be another update without errors eventually
                return
              }
              // Report the next compilation again
              readyIds.delete(page)
              return {
                action: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
              }
            }
          )

          const type = writtenEndpoint?.type

          if (type === 'edge') {
            await loadMiddlewareManifest(
              distDir,
              middlewareManifests,
              page,
              'app'
            )
          } else {
            middlewareManifests.delete(page)
          }

          await loadAppBuildManifest(distDir, appBuildManifests, page)
          await loadBuildManifest(distDir, buildManifests, page, 'app')
          await loadAppPathManifest(distDir, appPathsManifests, page, 'app')
          await loadActionManifest(distDir, actionManifests, page)
          await loadFontManifest(distDir, fontManifests, page, 'app')
          await writeManifests(
            opts,
            distDir,
            buildManifests,
            appBuildManifests,
            pagesManifests,
            appPathsManifests,
            middlewareManifests,
            actionManifests,
            fontManifests,
            loadableManifests,
            currentEntrypoints
          )

          processIssues(currentIssues, page, writtenEndpoint, true)

          break
        }
        case 'app-route': {
          finishBuilding = startBuilding(page, requestUrl)
          const writtenEndpoint = await handleRequireCacheClearing(
            page,
            await route.endpoint.writeToDisk()
          )

          const type = writtenEndpoint?.type

          await loadAppPathManifest(
            distDir,
            appPathsManifests,
            page,
            'app-route'
          )
          if (type === 'edge') {
            await loadMiddlewareManifest(
              distDir,
              middlewareManifests,
              page,
              'app-route'
            )
          } else {
            middlewareManifests.delete(page)
          }

          await writeManifests(
            opts,
            distDir,
            buildManifests,
            appBuildManifests,
            pagesManifests,
            appPathsManifests,
            middlewareManifests,
            actionManifests,
            fontManifests,
            loadableManifests,
            currentEntrypoints
          )
          processIssues(currentIssues, page, writtenEndpoint, true)

          break
        }
        default: {
          throw new Error(
            `unknown route type ${(route as any).type} for ${page}`
          )
        }
      }
    } finally {
      if (finishBuilding) finishBuilding()
    }
  }

  const hotReloader: NextJsHotReloaderInterface = {
    turbopackProject: project,
    activeWebpackConfigs: undefined,
    serverStats: null,
    edgeServerStats: null,
    async run(req, res, _parsedUrl) {
      // intercept page chunks request and ensure them with turbopack
      if (req.url?.startsWith('/_next/static/chunks/pages/')) {
        const params = matchNextPageBundleRequest(req.url)

        if (params) {
          const decodedPagePath = `/${params.path
            .map((param: string) => decodeURIComponent(param))
            .join('/')}`

          const denormalizedPagePath = denormalizePagePath(decodedPagePath)

          await hotReloader
            .ensurePage({
              page: denormalizedPagePath,
              clientOnly: false,
              definition: undefined,
              url: req.url,
            })
            .catch(console.error)
        }
      }

      await overlayMiddleware(req, res)

      // Request was not finished.
      return { finished: undefined }
    },

    // TODO: Figure out if socket type can match the NextJsHotReloaderInterface
    onHMR(req, socket: Socket, head) {
      wsServer.handleUpgrade(req, socket, head, (client) => {
        clients.add(client)
        client.on('close', () => clients.delete(client))

        client.addEventListener('message', ({ data }) => {
          const parsedData = JSON.parse(
            typeof data !== 'string' ? data.toString() : data
          )

          // Next.js messages
          switch (parsedData.event) {
            case 'ping':
              // Ping doesn't need additional handling in Turbopack.
              break
            case 'span-end': {
              hotReloaderSpan.manualTraceChild(
                parsedData.spanName,
                msToNs(parsedData.startTime),
                msToNs(parsedData.endTime),
                parsedData.attributes
              )
              break
            }
            case 'client-hmr-latency': // { id, startTime, endTime, page, updatedModules, isPageHidden }
              hotReloaderSpan.manualTraceChild(
                parsedData.event,
                msToNs(parsedData.startTime),
                msToNs(parsedData.endTime),
                {
                  updatedModules: parsedData.updatedModules,
                  page: parsedData.page,
                  isPageHidden: parsedData.isPageHidden,
                }
              )
              break
            case 'client-error': // { errorCount, clientId }
            case 'client-warning': // { warningCount, clientId }
            case 'client-success': // { clientId }
            case 'server-component-reload-page': // { clientId }
            case 'client-reload-page': // { clientId }
            case 'client-removed-page': // { page }
            case 'client-full-reload': // { stackTrace, hadRuntimeError }
            case 'client-added-page':
              // TODO
              break

            default:
              // Might be a Turbopack message...
              if (!parsedData.type) {
                throw new Error(`unrecognized HMR message "${data}"`)
              }
          }

          // Turbopack messages
          switch (parsedData.type) {
            case 'turbopack-subscribe':
              subscribeToHmrEvents(parsedData.path, client)
              break

            case 'turbopack-unsubscribe':
              unsubscribeToHmrEvents(parsedData.path, client)
              break

            default:
              if (!parsedData.event) {
                throw new Error(`unrecognized Turbopack HMR message "${data}"`)
              }
          }
        })

        const turbopackConnected: TurbopackConnectedAction = {
          action: HMR_ACTIONS_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
        }
        client.send(JSON.stringify(turbopackConnected))

        const errors = []
        for (const pageIssues of currentIssues.values()) {
          for (const issue of pageIssues.values()) {
            errors.push({
              message: formatIssue(issue),
            })
          }
        }

        const sync: SyncAction = {
          action: HMR_ACTIONS_SENT_TO_BROWSER.SYNC,
          errors,
          warnings: [],
          hash: '',
          versionInfo,
        }

        this.send(sync)
      })
    },

    send(action) {
      const payload = JSON.stringify(action)
      for (const client of clients) {
        client.send(payload)
      }
    },

    setHmrServerError(_error) {
      // Not implemented yet.
    },
    clearHmrServerError() {
      // Not implemented yet.
    },
    async start() {},
    async stop() {
      // Not implemented yet.
    },
    async getCompilationErrors(page) {
      const thisPageIssues = currentIssues.get(page)
      if (thisPageIssues !== undefined && thisPageIssues.size > 0) {
        // If there is an error related to the requesting page we display it instead of the first error
        return [...thisPageIssues.values()].map(
          (issue) => new Error(formatIssue(issue))
        )
      }

      // Otherwise, return all errors across pages
      const errors = []
      for (const pageIssues of currentIssues.values()) {
        for (const issue of pageIssues.values()) {
          errors.push(new Error(formatIssue(issue)))
        }
      }
      return errors
    },
    async invalidate({
      // .env files or tsconfig/jsconfig change
      reloadAfterInvalidation,
    }) {
      if (reloadAfterInvalidation) {
        await clearAllModuleContexts()
        this.send({
          action: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
        })
      }
    },
    async buildFallbackError() {
      // Not implemented yet.
    },
    async ensurePage({
      page: inputPage,
      // Unused parameters
      // clientOnly,
      // appPaths,
      definition,
      isApp,
      url: requestUrl,
    }) {
      const page = definition?.pathname ?? inputPage

      if (page === '/_error') {
        let finishBuilding = startBuilding(page, requestUrl)
        try {
          if (globalEntrypoints.app) {
            const writtenEndpoint = await handleRequireCacheClearing(
              '_app',
              await globalEntrypoints.app.writeToDisk()
            )
            processIssues(currentIssues, '_app', writtenEndpoint)
          }
          await loadBuildManifest(distDir, buildManifests, '_app')
          await loadPagesManifest(distDir, pagesManifests, '_app')
          await loadFontManifest(distDir, fontManifests, '_app')

          if (globalEntrypoints.document) {
            const writtenEndpoint = await handleRequireCacheClearing(
              '_document',
              await globalEntrypoints.document.writeToDisk()
            )
            changeSubscription(
              '_document',
              'server',
              false,
              globalEntrypoints.document,
              () => {
                return { action: HMR_ACTIONS_SENT_TO_BROWSER.RELOAD_PAGE }
              }
            )
            processIssues(currentIssues, '_document', writtenEndpoint)
          }
          await loadPagesManifest(distDir, pagesManifests, '_document')

          if (globalEntrypoints.error) {
            const writtenEndpoint = await handleRequireCacheClearing(
              '_error',
              await globalEntrypoints.error.writeToDisk()
            )
            processIssues(currentIssues, page, writtenEndpoint)
          }
          await loadBuildManifest(distDir, buildManifests, '_error')
          await loadPagesManifest(distDir, pagesManifests, '_error')
          await loadFontManifest(distDir, fontManifests, '_error')

          await writeManifests(
            opts,
            distDir,
            buildManifests,
            appBuildManifests,
            pagesManifests,
            appPathsManifests,
            middlewareManifests,
            actionManifests,
            fontManifests,
            loadableManifests,
            currentEntrypoints
          )
        } finally {
          finishBuilding()
        }
        return
      }
      await currentEntriesHandling
      const route =
        currentEntrypoints.get(page) ??
        currentEntrypoints.get(
          normalizeAppPath(
            normalizeMetadataRoute(definition?.page ?? inputPage)
          )
        )

      if (!route) {
        // TODO: why is this entry missing in turbopack?
        if (page === '/_app') return
        if (page === '/_document') return
        if (page === '/middleware') return
        if (page === '/src/middleware') return
        if (page === '/instrumentation') return
        if (page === '/src/instrumentation') return

        throw new PageNotFoundError(`route not found ${page}`)
      }

      // We don't throw on ensureOpts.isApp === true for page-api
      // since this can happen when app pages make
      // api requests to page API routes.
      if (isApp && route.type === 'page') {
        throw new Error(`mis-matched route type: isApp && page for ${page}`)
      }

      await handleRouteType(page, route, requestUrl)
    },
  }

  ;(async function () {
    for await (const updateMessage of project.updateInfoSubscribe(30)) {
      switch (updateMessage.updateType) {
        case 'start': {
          hotReloader.send({ action: HMR_ACTIONS_SENT_TO_BROWSER.BUILDING })
          break
        }
        case 'end': {
          sendEnqueuedMessages()

          const errors = new Map<string, CompilationError>()
          for (const [, issueMap] of currentIssues) {
            for (const [key, issue] of issueMap) {
              if (errors.has(key)) continue

              const message = formatIssue(issue)

              errors.set(key, {
                message,
                details: issue.detail
                  ? renderStyledStringToErrorAnsi(issue.detail)
                  : undefined,
              })
            }
          }

          hotReloader.send({
            action: HMR_ACTIONS_SENT_TO_BROWSER.BUILT,
            hash: String(++hmrHash),
            errors: [...errors.values()],
            warnings: [],
          })

          if (hmrEventHappened) {
            const time = updateMessage.value.duration
            const timeMessage =
              time > 2000 ? `${Math.round(time / 100) / 10}s` : `${time}ms`
            Log.event(`Compiled in ${timeMessage}`)
            hmrEventHappened = false
          }
          break
        }
        default:
      }
    }
  })()

  return hotReloader
}

function renderStyledStringToErrorAnsi(string: StyledString): string {
  function decodeMagicIdentifiers(str: string): string {
    return str.replaceAll(MAGIC_IDENTIFIER_REGEX, (ident) => {
      try {
        return magenta(`{${decodeMagicIdentifier(ident)}}`)
      } catch (e) {
        return magenta(`{${ident} (decoding failed: ${e})}`)
      }
    })
  }

  switch (string.type) {
    case 'text':
      return decodeMagicIdentifiers(string.value)
    case 'strong':
      return bold(red(decodeMagicIdentifiers(string.value)))
    case 'code':
      return green(decodeMagicIdentifiers(string.value))
    case 'line':
      return string.value.map(renderStyledStringToErrorAnsi).join('')
    case 'stack':
      return string.value.map(renderStyledStringToErrorAnsi).join('\n')
    default:
      throw new Error('Unknown StyledString type', string)
  }
}

function msToNs(ms: number): bigint {
  return BigInt(Math.floor(ms)) * BigInt(MILLISECONDS_IN_NANOSECOND)
}
