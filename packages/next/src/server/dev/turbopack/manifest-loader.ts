import type {
  EdgeFunctionDefinition,
  MiddlewareManifest,
} from '../../../build/webpack/plugins/middleware-plugin'
import type { BuildManifest } from '../../get-page-files'
import type { AppBuildManifest } from '../../../build/webpack/plugins/app-build-manifest-plugin'
import type { PagesManifest } from '../../../build/webpack/plugins/pages-manifest-plugin'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import type { ActionManifest } from '../../../build/webpack/plugins/flight-client-entry-plugin'
import { generateRandomActionKeyRaw } from '../../app-render/action-encryption-utils'
import type { NextFontManifest } from '../../../build/webpack/plugins/next-font-manifest-plugin'
import type { LoadableManifest } from '../../load-components'
import type { NextConfigComplete } from '../../config-shared'
import loadJsConfig from '../../../build/load-jsconfig'
import {
  APP_BUILD_MANIFEST,
  APP_PATHS_MANIFEST,
  AUTOMATIC_FONT_OPTIMIZATION_MANIFEST,
  BUILD_MANIFEST,
  INTERCEPTION_ROUTE_REWRITE_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  MIDDLEWARE_MANIFEST,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  NEXT_FONT_MANIFEST,
  PAGES_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
} from '../../../shared/lib/constants'
import { join, posix } from 'path'
import { readFile, writeFile } from 'fs/promises'
import type { SetupOpts } from '../../lib/router-utils/setup-dev-bundler'
import { deleteCache } from '../../../build/webpack/plugins/nextjs-require-cache-hot-reloader'
import { writeFileAtomic } from '../../../lib/fs/write-atomic'
import { isInterceptionRouteRewrite } from '../../../lib/generate-interception-routes-rewrites'
import {
  type ClientBuildManifest,
  normalizeRewritesForBuildManifest,
  srcEmptySsgManifest,
} from '../../../build/webpack/plugins/build-manifest-plugin'
import type { CurrentEntrypoints } from '../turbopack-utils'

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

export async function loadBuildManifest(
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

export async function loadAppBuildManifest(
  distDir: string,
  appBuildManifests: AppBuildManifests,
  pageName: string
): Promise<void> {
  appBuildManifests.set(
    pageName,
    await readPartialManifest(distDir, APP_BUILD_MANIFEST, pageName, 'app')
  )
}

export async function loadPagesManifest(
  distDir: string,
  pagesManifests: PagesManifests,
  pageName: string
): Promise<void> {
  pagesManifests.set(
    pageName,
    await readPartialManifest(distDir, PAGES_MANIFEST, pageName)
  )
}

export async function loadAppPathManifest(
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

export async function loadActionManifest(
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

export async function loadFontManifest(
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

export async function loadLoadableManifest(
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

export class ManifestLoader {
  buildManifests: BuildManifests = new Map()
  appBuildManifests: AppBuildManifests = new Map()
  pagesManifests: PagesManifests = new Map()
  appPathsManifests: AppPathsManifests = new Map()
  middlewareManifests: MiddlewareManifests = new Map()
  actionManifests: ActionManifests = new Map()
  fontManifests: FontManifests = new Map()
  loadableManifests: LoadableManifests = new Map()

  async writeManifests({
    distDir,
    buildId,
    rewrites,
    currentEntrypoints,
  }: {
    distDir: string
    buildId: string
    rewrites: SetupOpts['fsChecker']['rewrites']
    currentEntrypoints: CurrentEntrypoints
  }) {
    await writeBuildManifest(
      distDir,
      buildId,
      this.buildManifests,
      currentEntrypoints,
      rewrites
    )
    await writeAppBuildManifest(distDir, this.appBuildManifests)
    await writePagesManifest(distDir, this.pagesManifests)
    await writeAppPathsManifest(distDir, this.appPathsManifests)
    await writeMiddlewareManifest(distDir, this.middlewareManifests)
    await writeActionManifest(distDir, this.actionManifests)
    await writeNextFontManifest(distDir, this.fontManifests)
    await writeLoadableManifest(distDir, this.loadableManifests)
    await writeFallbackBuildManifest(distDir, this.buildManifests)
    await writeAutomaticFontOptimizationManifest(distDir)
  }
}
