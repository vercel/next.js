import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'
import type { NextFontManifest } from '../../build/webpack/plugins/next-font-manifest-plugin'
import { generateRandomActionKeyRaw } from '../app-render/action-encryption-utils'
import type { LoadableManifest } from '../load-components'
import type {
  EdgeFunctionDefinition,
  MiddlewareManifest,
} from '../../build/webpack/plugins/middleware-plugin'
import type { PagesManifest } from '../../build/webpack/plugins/pages-manifest-plugin'
import type { AppBuildManifest } from '../../build/webpack/plugins/app-build-manifest-plugin'
import type { BuildManifest } from '../get-page-files'
import type { NextConfigComplete } from '../config-shared'
import loadJsConfig from '../../build/load-jsconfig'
import { join, posix } from 'path'
import { readFile, writeFile } from 'fs/promises'
import {
  APP_BUILD_MANIFEST,
  APP_PATHS_MANIFEST,
  BUILD_MANIFEST,
  MIDDLEWARE_MANIFEST,
  NEXT_FONT_MANIFEST,
  PAGES_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  INTERCEPTION_ROUTE_REWRITE_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  AUTOMATIC_FONT_OPTIMIZATION_MANIFEST,
} from '../../shared/lib/constants'
import { writeFileAtomic } from '../../lib/fs/write-atomic'
import { deleteCache } from '../../build/webpack/plugins/nextjs-require-cache-hot-reloader'
import {
  normalizeRewritesForBuildManifest,
  type ClientBuildManifest,
  srcEmptySsgManifest,
} from '../../build/webpack/plugins/build-manifest-plugin'
import type {
  ServerFields,
  SetupOpts,
} from '../lib/router-utils/setup-dev-bundler'
import { isInterceptionRouteRewrite } from '../../lib/generate-interception-routes-rewrites'
import type {
  Issue,
  Route,
  TurbopackResult,
  StyledString,
  Endpoint,
  WrittenEndpoint,
  Entrypoints,
} from '../../build/swc'
import {
  MAGIC_IDENTIFIER_REGEX,
  decodeMagicIdentifier,
} from '../../shared/lib/magic-identifier'
import { bold, green, magenta, red } from '../../lib/picocolors'
import {
  HMR_ACTIONS_SENT_TO_BROWSER,
  type HMR_ACTION_TYPES,
} from './hot-reloader-types'
import * as Log from '../../build/output/log'
import type { PropagateToWorkersField } from '../lib/router-utils/types'

export interface InstrumentationDefinition {
  files: string[]
  name: 'instrumentation'
}
export type TurbopackMiddlewareManifest = MiddlewareManifest & {
  instrumentation?: InstrumentationDefinition
}

export function mergeBuildManifests(manifests: Iterable<BuildManifest>) {
  const manifest: Partial<BuildManifest> & Pick<BuildManifest, 'pages'> = {
    pages: {
      '/_app': [],
    },
    // Something in next.js depends on these to exist even for app dir rendering
    devFiles: [],
    ampDevFiles: [],
    polyfillFiles: [],
    lowPriorityFiles: [
      'static/development/_ssgManifest.js',
      'static/development/_buildManifest.js',
    ],
    rootMainFiles: [],
    ampFirstPages: [],
  }
  for (const m of manifests) {
    Object.assign(manifest.pages, m.pages)
    if (m.rootMainFiles.length) manifest.rootMainFiles = m.rootMainFiles
  }
  return manifest
}

export function mergeAppBuildManifests(manifests: Iterable<AppBuildManifest>) {
  const manifest: AppBuildManifest = {
    pages: {},
  }
  for (const m of manifests) {
    Object.assign(manifest.pages, m.pages)
  }
  return manifest
}

export function mergePagesManifests(manifests: Iterable<PagesManifest>) {
  const manifest: PagesManifest = {}
  for (const m of manifests) {
    Object.assign(manifest, m)
  }
  return manifest
}

export function mergeMiddlewareManifests(
  manifests: Iterable<TurbopackMiddlewareManifest>
): MiddlewareManifest {
  const manifest: MiddlewareManifest = {
    version: 2,
    middleware: {},
    sortedMiddleware: [],
    functions: {},
  }
  let instrumentation: InstrumentationDefinition | undefined = undefined
  for (const m of manifests) {
    Object.assign(manifest.functions, m.functions)
    Object.assign(manifest.middleware, m.middleware)
    if (m.instrumentation) {
      instrumentation = m.instrumentation
    }
  }
  const updateFunctionDefinition = (
    fun: EdgeFunctionDefinition
  ): EdgeFunctionDefinition => {
    return {
      ...fun,
      files: [...(instrumentation?.files ?? []), ...fun.files],
    }
  }
  for (const key of Object.keys(manifest.middleware)) {
    const value = manifest.middleware[key]
    manifest.middleware[key] = updateFunctionDefinition(value)
  }
  for (const key of Object.keys(manifest.functions)) {
    const value = manifest.functions[key]
    manifest.functions[key] = updateFunctionDefinition(value)
  }
  for (const fun of Object.values(manifest.functions).concat(
    Object.values(manifest.middleware)
  )) {
    for (const matcher of fun.matchers) {
      if (!matcher.regexp) {
        matcher.regexp = pathToRegexp(matcher.originalSource, [], {
          delimiter: '/',
          sensitive: false,
          strict: true,
        }).source.replaceAll('\\/', '/')
      }
    }
  }
  manifest.sortedMiddleware = Object.keys(manifest.middleware)

  return manifest
}

export async function mergeActionManifests(
  manifests: Iterable<ActionManifest>
) {
  type ActionEntries = ActionManifest['edge' | 'node']
  const manifest: ActionManifest = {
    node: {},
    edge: {},
    encryptionKey: await generateRandomActionKeyRaw(true),
  }

  function mergeActionIds(
    actionEntries: ActionEntries,
    other: ActionEntries
  ): void {
    for (const key in other) {
      const action = (actionEntries[key] ??= {
        workers: {},
        layer: {},
      })
      Object.assign(action.workers, other[key].workers)
      Object.assign(action.layer, other[key].layer)
    }
  }

  for (const m of manifests) {
    mergeActionIds(manifest.node, m.node)
    mergeActionIds(manifest.edge, m.edge)
  }

  return manifest
}

export function mergeFontManifests(manifests: Iterable<NextFontManifest>) {
  const manifest: NextFontManifest = {
    app: {},
    appUsingSizeAdjust: false,
    pages: {},
    pagesUsingSizeAdjust: false,
  }
  for (const m of manifests) {
    Object.assign(manifest.app, m.app)
    Object.assign(manifest.pages, m.pages)

    manifest.appUsingSizeAdjust =
      manifest.appUsingSizeAdjust || m.appUsingSizeAdjust
    manifest.pagesUsingSizeAdjust =
      manifest.pagesUsingSizeAdjust || m.pagesUsingSizeAdjust
  }
  return manifest
}

export function mergeLoadableManifests(manifests: Iterable<LoadableManifest>) {
  const manifest: LoadableManifest = {}
  for (const m of manifests) {
    Object.assign(manifest, m)
  }
  return manifest
}

export async function getTurbopackJsConfig(
  dir: string,
  nextConfig: NextConfigComplete
) {
  const { jsConfig } = await loadJsConfig(dir, nextConfig)
  return jsConfig ?? { compilerOptions: {} }
}

export async function readPartialManifest<T>(
  distDir: string,
  name:
    | typeof MIDDLEWARE_MANIFEST
    | typeof BUILD_MANIFEST
    | typeof APP_BUILD_MANIFEST
    | typeof PAGES_MANIFEST
    | typeof APP_PATHS_MANIFEST
    | `${typeof SERVER_REFERENCE_MANIFEST}.json`
    | `${typeof NEXT_FONT_MANIFEST}.json`
    | typeof REACT_LOADABLE_MANIFEST,
  pageName: string,
  type:
    | 'pages'
    | 'app'
    | 'app-route'
    | 'middleware'
    | 'instrumentation' = 'pages'
): Promise<T> {
  const manifestPath = posix.join(
    distDir,
    `server`,
    type === 'app-route' ? 'app' : type,
    type === 'middleware' || type === 'instrumentation'
      ? ''
      : pageName === '/'
      ? 'index'
      : pageName === '/index' || pageName.startsWith('/index/')
      ? `/index${pageName}`
      : pageName,
    type === 'app' ? 'page' : type === 'app-route' ? 'route' : '',
    name
  )
  return JSON.parse(await readFile(posix.join(manifestPath), 'utf-8')) as T
}

export type BuildManifests = Map<string, BuildManifest>
export type AppBuildManifests = Map<string, AppBuildManifest>
export type PagesManifests = Map<string, PagesManifest>
export type AppPathsManifests = Map<string, PagesManifest>
export type MiddlewareManifests = Map<string, TurbopackMiddlewareManifest>
export type ActionManifests = Map<string, ActionManifest>
export type FontManifests = Map<string, NextFontManifest>
export type LoadableManifests = Map<string, LoadableManifest>
export type CurrentEntrypoints = Map<string, Route>
export type ChangeSubscriptions = Map<
  string,
  Promise<AsyncIterableIterator<TurbopackResult>>
>

export async function loadMiddlewareManifest(
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
  buildId: string,
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
    join(distDir, 'static', buildId, '_buildManifest.js'),
    buildManifestJs
  )
  await writeFileAtomic(
    join(distDir, 'static', buildId, '_ssgManifest.js'),
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

async function writeNextFontManifest(
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

/**
 * Turbopack doesn't support this functionality, so it writes an empty manifest.
 */
async function writeAutomaticFontOptimizationManifest(distDir: string) {
  const manifestPath = join(
    distDir,
    'server',
    AUTOMATIC_FONT_OPTIMIZATION_MANIFEST
  )

  await writeFileAtomic(manifestPath, JSON.stringify([]))
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

export async function writeManifests({
  rewrites,
  distDir,
  buildId,
  buildManifests,
  appBuildManifests,
  pagesManifests,
  appPathsManifests,
  middlewareManifests,
  actionManifests,
  fontManifests,
  loadableManifests,
  currentEntrypoints,
}: {
  rewrites: SetupOpts['fsChecker']['rewrites']
  distDir: string
  buildId: string
  buildManifests: BuildManifests
  appBuildManifests: AppBuildManifests
  pagesManifests: PagesManifests
  appPathsManifests: AppPathsManifests
  middlewareManifests: MiddlewareManifests
  actionManifests: ActionManifests
  fontManifests: FontManifests
  loadableManifests: LoadableManifests
  currentEntrypoints: CurrentEntrypoints
}): Promise<void> {
  await writeBuildManifest(
    distDir,
    buildId,
    buildManifests,
    currentEntrypoints,
    rewrites
  )
  await writeAppBuildManifest(distDir, appBuildManifests)
  await writePagesManifest(distDir, pagesManifests)
  await writeAppPathsManifest(distDir, appPathsManifests)
  await writeMiddlewareManifest(distDir, middlewareManifests)
  await writeActionManifest(distDir, actionManifests)
  await writeNextFontManifest(distDir, fontManifests)
  await writeLoadableManifest(distDir, loadableManifests)
  await writeFallbackBuildManifest(distDir, buildManifests)
  await writeAutomaticFontOptimizationManifest(distDir)
}

class ModuleBuildError extends Error {}

function issueKey(issue: Issue): string {
  return [
    issue.severity,
    issue.filePath,
    JSON.stringify(issue.title),
    JSON.stringify(issue.description),
  ].join('-')
}

export function formatIssue(issue: Issue) {
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

export type CurrentIssues = Map<string, Map<string, Issue>>

export function processIssues(
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

export function renderStyledStringToErrorAnsi(string: StyledString): string {
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

const MILLISECONDS_IN_NANOSECOND = 1_000_000

export function msToNs(ms: number): bigint {
  return BigInt(Math.floor(ms)) * BigInt(MILLISECONDS_IN_NANOSECOND)
}

export interface GlobalEntrypoints {
  app: Endpoint | undefined
  document: Endpoint | undefined
  error: Endpoint | undefined
}

export type HandleRequireCacheClearing = (
  id: string,
  result: TurbopackResult<WrittenEndpoint>
) => void

export type ChangeSubscription = (
  page: string,
  type: 'client' | 'server',
  includeIssues: boolean,
  endpoint: Endpoint | undefined,
  makePayload: (
    page: string,
    change: TurbopackResult
  ) => Promise<HMR_ACTION_TYPES> | HMR_ACTION_TYPES | void
) => Promise<void>

export type ClearChangeSubscription = (
  page: string,
  type: 'server' | 'client'
) => Promise<void>

export type SendHmr = (id: string, payload: HMR_ACTION_TYPES) => void

export type StartBuilding = (
  id: string,
  requestUrl: string | undefined,
  forceRebuild: boolean
) => () => void

export type ReadyIds = Set<string>

export async function handleRouteType({
  rewrites,
  distDir,
  buildId,
  globalEntrypoints,
  currentIssues,
  buildManifests,
  appBuildManifests,
  pagesManifests,
  appPathsManifests,
  middlewareManifests,
  actionManifests,
  fontManifests,
  loadableManifests,
  currentEntrypoints,
  handleRequireCacheClearing,
  changeSubscription,
  readyIds,
  page,
  route,
}: {
  rewrites: SetupOpts['fsChecker']['rewrites']
  distDir: string
  buildId: string
  globalEntrypoints: GlobalEntrypoints
  currentIssues: CurrentIssues
  buildManifests: BuildManifests
  appBuildManifests: AppBuildManifests
  pagesManifests: PagesManifests
  appPathsManifests: AppPathsManifests
  middlewareManifests: MiddlewareManifests
  actionManifests: ActionManifests
  fontManifests: FontManifests
  loadableManifests: LoadableManifests
  currentEntrypoints: CurrentEntrypoints
  handleRequireCacheClearing: HandleRequireCacheClearing | undefined // Dev
  changeSubscription: ChangeSubscription | undefined // Dev
  readyIds: ReadyIds | undefined // Dev
  page: string
  route: Route
}) {
  switch (route.type) {
    case 'page': {
      try {
        if (globalEntrypoints.app) {
          const writtenEndpoint = await globalEntrypoints.app.writeToDisk()
          handleRequireCacheClearing?.('_app', writtenEndpoint)
          processIssues(currentIssues, '_app', writtenEndpoint)
        }
        await loadBuildManifest(distDir, buildManifests, '_app')
        await loadPagesManifest(distDir, pagesManifests, '_app')

        if (globalEntrypoints.document) {
          const writtenEndpoint = await globalEntrypoints.document.writeToDisk()
          handleRequireCacheClearing?.('_document', writtenEndpoint)
          processIssues(currentIssues, '_document', writtenEndpoint)
        }
        await loadPagesManifest(distDir, pagesManifests, '_document')

        const writtenEndpoint = await route.htmlEndpoint.writeToDisk()
        handleRequireCacheClearing?.(page, writtenEndpoint)

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
        await loadLoadableManifest(distDir, loadableManifests, page, 'pages')

        await writeManifests({
          rewrites,
          distDir,
          buildId,
          buildManifests,
          appBuildManifests,
          pagesManifests,
          appPathsManifests,
          middlewareManifests,
          actionManifests,
          fontManifests,
          loadableManifests,
          currentEntrypoints,
        })

        processIssues(currentIssues, page, writtenEndpoint)
      } finally {
        changeSubscription?.(
          page,
          'server',
          false,
          route.dataEndpoint,
          (pageName) => {
            // Report the next compilation again
            readyIds?.delete(page)
            return {
              event: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_ONLY_CHANGES,
              pages: [pageName],
            }
          }
        )
        changeSubscription?.(page, 'client', false, route.htmlEndpoint, () => {
          return {
            event: HMR_ACTIONS_SENT_TO_BROWSER.CLIENT_CHANGES,
          }
        })
        if (globalEntrypoints.document) {
          changeSubscription?.(
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
      const writtenEndpoint = await route.endpoint.writeToDisk()
      handleRequireCacheClearing?.(page, writtenEndpoint)

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

      await writeManifests({
        rewrites,
        distDir,
        buildId,
        buildManifests,
        appBuildManifests,
        pagesManifests,
        appPathsManifests,
        middlewareManifests,
        actionManifests,
        fontManifests,
        loadableManifests,
        currentEntrypoints,
      })

      processIssues(currentIssues, page, writtenEndpoint)

      break
    }
    case 'app-page': {
      const writtenEndpoint = await route.htmlEndpoint.writeToDisk()
      handleRequireCacheClearing?.(page, writtenEndpoint)

      changeSubscription?.(
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
          readyIds?.delete(page)
          return {
            action: HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
          }
        }
      )

      const type = writtenEndpoint?.type

      if (type === 'edge') {
        await loadMiddlewareManifest(distDir, middlewareManifests, page, 'app')
      } else {
        middlewareManifests.delete(page)
      }

      await loadAppBuildManifest(distDir, appBuildManifests, page)
      await loadBuildManifest(distDir, buildManifests, page, 'app')
      await loadAppPathManifest(distDir, appPathsManifests, page, 'app')
      await loadActionManifest(distDir, actionManifests, page)
      await loadFontManifest(distDir, fontManifests, page, 'app')
      await writeManifests({
        rewrites,
        distDir,
        buildId,
        buildManifests,
        appBuildManifests,
        pagesManifests,
        appPathsManifests,
        middlewareManifests,
        actionManifests,
        fontManifests,
        loadableManifests,
        currentEntrypoints,
      })

      processIssues(currentIssues, page, writtenEndpoint, true)

      break
    }
    case 'app-route': {
      const writtenEndpoint = await route.endpoint.writeToDisk()
      handleRequireCacheClearing?.(page, writtenEndpoint)

      const type = writtenEndpoint?.type

      await loadAppPathManifest(distDir, appPathsManifests, page, 'app-route')
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

      await writeManifests({
        rewrites,
        distDir,
        buildId,
        buildManifests,
        appBuildManifests,
        pagesManifests,
        appPathsManifests,
        middlewareManifests,
        actionManifests,
        fontManifests,
        loadableManifests,
        currentEntrypoints,
      })
      processIssues(currentIssues, page, writtenEndpoint, true)

      break
    }
    default: {
      throw new Error(`unknown route type ${(route as any).type} for ${page}`)
    }
  }
}

export async function handleEntrypoints({
  rewrites,
  nextConfig,
  entrypoints,
  serverFields,
  propagateServerField,
  distDir,
  buildId,
  globalEntrypoints,
  currentEntrypoints,
  changeSubscriptions,
  changeSubscription,
  clearChangeSubscription,
  sendHmr,
  startBuilding,
  handleRequireCacheClearing,
  prevMiddleware,
  currentIssues,
  buildManifests,
  appBuildManifests,
  pagesManifests,
  appPathsManifests,
  middlewareManifests,
  actionManifests,
  fontManifests,
  loadableManifests,
}: {
  rewrites: SetupOpts['fsChecker']['rewrites']
  nextConfig: NextConfigComplete
  entrypoints: TurbopackResult<Entrypoints>
  serverFields: ServerFields | undefined
  propagateServerField:
    | ((field: PropagateToWorkersField, args: any) => Promise<void>)
    | undefined
  distDir: string
  buildId: string
  globalEntrypoints: GlobalEntrypoints
  currentEntrypoints: CurrentEntrypoints
  changeSubscriptions: ChangeSubscriptions | undefined
  changeSubscription: ChangeSubscription | undefined
  clearChangeSubscription: ClearChangeSubscription | undefined
  sendHmr: SendHmr | undefined
  startBuilding: StartBuilding | undefined
  handleRequireCacheClearing: HandleRequireCacheClearing | undefined
  prevMiddleware: boolean | undefined
  currentIssues: CurrentIssues
  buildManifests: BuildManifests
  appBuildManifests: AppBuildManifests
  pagesManifests: PagesManifests
  appPathsManifests: AppPathsManifests
  middlewareManifests: MiddlewareManifests
  actionManifests: ActionManifests
  fontManifests: FontManifests
  loadableManifests: LoadableManifests
}) {
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

  if (changeSubscriptions) {
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
  }

  const { middleware, instrumentation } = entrypoints
  // We check for explicit true/false, since it's initialized to
  // undefined during the first loop (middlewareChanges event is
  // unnecessary during the first serve)
  if (prevMiddleware === true && !middleware) {
    // Went from middleware to no middleware
    await clearChangeSubscription?.('middleware', 'server')
    sendHmr?.('middleware', {
      event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
    })
  } else if (prevMiddleware === false && middleware) {
    // Went from no middleware to middleware
    sendHmr?.('middleware', {
      event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES,
    })
  }

  if (nextConfig.experimental.instrumentationHook && instrumentation) {
    const processInstrumentation = async (
      displayName: string,
      name: string,
      prop: 'nodeJs' | 'edge'
    ) => {
      const writtenEndpoint = await instrumentation[prop].writeToDisk()
      handleRequireCacheClearing?.(displayName, writtenEndpoint)
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
    await writeManifests({
      rewrites: rewrites,
      distDir,
      buildId,
      buildManifests,
      appBuildManifests,
      pagesManifests,
      appPathsManifests,
      middlewareManifests,
      actionManifests,
      fontManifests,
      loadableManifests,
      currentEntrypoints,
    })

    if (serverFields && propagateServerField) {
      serverFields.actualInstrumentationHookFile = '/instrumentation'
      await propagateServerField(
        'actualInstrumentationHookFile',
        serverFields.actualInstrumentationHookFile
      )
    }
  } else {
    if (serverFields && propagateServerField) {
      serverFields.actualInstrumentationHookFile = undefined
      await propagateServerField(
        'actualInstrumentationHookFile',
        serverFields.actualInstrumentationHookFile
      )
    }
  }
  if (middleware) {
    const processMiddleware = async () => {
      const writtenEndpoint = await middleware.endpoint.writeToDisk()
      handleRequireCacheClearing?.('middleware', writtenEndpoint)
      processIssues(currentIssues, 'middleware', writtenEndpoint)
      await loadMiddlewareManifest(
        distDir,
        middlewareManifests,
        'middleware',
        'middleware'
      )
      if (serverFields) {
        serverFields.middleware = {
          match: null as any,
          page: '/',
          matchers:
            middlewareManifests.get('middleware')?.middleware['/'].matchers,
        }
      }
    }
    await processMiddleware()

    changeSubscription?.(
      'middleware',
      'server',
      false,
      middleware.endpoint,
      async () => {
        const finishBuilding = startBuilding?.('middleware', undefined, true)
        await processMiddleware()
        if (serverFields && propagateServerField) {
          await propagateServerField(
            'actualMiddlewareFile',
            serverFields.actualMiddlewareFile
          )
          await propagateServerField('middleware', serverFields.middleware)
        }
        await writeManifests({
          rewrites: rewrites,
          distDir,
          buildId,
          buildManifests,
          appBuildManifests,
          pagesManifests,
          appPathsManifests,
          middlewareManifests,
          actionManifests,
          fontManifests,
          loadableManifests,
          currentEntrypoints,
        })

        finishBuilding?.()
        return { event: HMR_ACTIONS_SENT_TO_BROWSER.MIDDLEWARE_CHANGES }
      }
    )
    prevMiddleware = true
  } else {
    middlewareManifests.delete('middleware')
    if (serverFields) {
      serverFields.actualMiddlewareFile = undefined
      serverFields.middleware = undefined
      prevMiddleware = false
    }
  }
  if (serverFields && propagateServerField) {
    await propagateServerField(
      'actualMiddlewareFile',
      serverFields.actualMiddlewareFile
    )
    await propagateServerField('middleware', serverFields.middleware)
  }
}

export async function handlePagesErrorRoute({
  rewrites,
  globalEntrypoints,
  currentIssues,
  distDir,
  buildId,
  buildManifests,
  pagesManifests,
  fontManifests,
  appBuildManifests,
  appPathsManifests,
  middlewareManifests,
  actionManifests,
  loadableManifests,
  currentEntrypoints,
  handleRequireCacheClearing,
  changeSubscription,
}: {
  rewrites: SetupOpts['fsChecker']['rewrites']
  globalEntrypoints: GlobalEntrypoints
  currentIssues: CurrentIssues
  distDir: string
  buildId: string
  buildManifests: BuildManifests
  pagesManifests: PagesManifests
  fontManifests: FontManifests
  appBuildManifests: AppBuildManifests
  appPathsManifests: AppPathsManifests
  middlewareManifests: MiddlewareManifests
  actionManifests: ActionManifests
  loadableManifests: LoadableManifests
  currentEntrypoints: CurrentEntrypoints
  handleRequireCacheClearing: HandleRequireCacheClearing | undefined
  changeSubscription: ChangeSubscription | undefined
}) {
  if (globalEntrypoints.app) {
    const writtenEndpoint = await globalEntrypoints.app.writeToDisk()
    handleRequireCacheClearing?.('_app', writtenEndpoint)
    processIssues(currentIssues, '_app', writtenEndpoint)
  }
  await loadBuildManifest(distDir, buildManifests, '_app')
  await loadPagesManifest(distDir, pagesManifests, '_app')
  await loadFontManifest(distDir, fontManifests, '_app')

  if (globalEntrypoints.document) {
    const writtenEndpoint = await globalEntrypoints.document.writeToDisk()
    handleRequireCacheClearing?.('_document', writtenEndpoint)
    changeSubscription?.(
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
    const writtenEndpoint = await globalEntrypoints.error.writeToDisk()
    handleRequireCacheClearing?.('_error', writtenEndpoint)
    processIssues(currentIssues, '/_error', writtenEndpoint)
  }
  await loadBuildManifest(distDir, buildManifests, '_error')
  await loadPagesManifest(distDir, pagesManifests, '_error')
  await loadFontManifest(distDir, fontManifests, '_error')

  await writeManifests({
    rewrites,
    distDir,
    buildId,
    buildManifests,
    appBuildManifests,
    pagesManifests,
    appPathsManifests,
    middlewareManifests,
    actionManifests,
    fontManifests,
    loadableManifests,
    currentEntrypoints,
  })
}
