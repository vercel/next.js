import type {
  EdgeFunctionDefinition,
  MiddlewareManifest,
} from '../../../build/webpack/plugins/middleware-plugin'
import type { BuildManifest } from '../../../server/get-page-files'
import type { PagesManifest } from '../../../build/webpack/plugins/pages-manifest-plugin'
import type { ActionManifest } from '../../../build/webpack/plugins/flight-client-entry-plugin'
import type { NextFontManifest } from '../../../build/webpack/plugins/next-font-manifest-plugin'
import type { REACT_LOADABLE_MANIFEST } from '../constants'
import {
  APP_PATHS_MANIFEST,
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  INTERCEPTION_ROUTE_REWRITE_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  MIDDLEWARE_MANIFEST,
  NEXT_FONT_MANIFEST,
  PAGES_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  SUBRESOURCE_INTEGRITY_MANIFEST,
  TURBOPACK_CLIENT_BUILD_MANIFEST,
  TURBOPACK_CLIENT_MIDDLEWARE_MANIFEST,
} from '../constants'
import { join, posix } from 'path'
import { readFileSync } from 'fs'
import type { SetupOpts } from '../../../server/lib/router-utils/setup-dev-bundler'
import { deleteCache } from '../../../server/dev/require-cache'
import { writeFileAtomic } from '../../../lib/fs/write-atomic'
import getAssetPathFromRoute from '../router/utils/get-asset-path-from-route'
import { getEntryKey, splitEntryKey, type EntryKey } from './entry-key'
import type { CustomRoutes } from '../../../lib/load-custom-routes'
import { getSortedRoutes } from '../router/utils'
import { existsSync } from 'fs'
import {
  addMetadataIdToRoute,
  addRouteSuffix,
  removeRouteSuffix,
} from '../../../server/dev/turbopack-utils'
import { tryToParsePath } from '../../../lib/try-to-parse-path'
import { safePathToRegexp } from '../router/utils/route-match-utils'
import type { Entrypoints } from '../../../build/swc/types'
import {
  normalizeRewritesForBuildManifest,
  type ClientBuildManifest,
  srcEmptySsgManifest,
  processRoute,
  createEdgeRuntimeManifest,
} from '../../../build/webpack/plugins/build-manifest-plugin-utils'
import type { SubresourceIntegrityManifest } from '../../../build'

interface InstrumentationDefinition {
  files: string[]
  name: 'instrumentation'
}

type TurbopackMiddlewareManifest = MiddlewareManifest & {
  instrumentation?: InstrumentationDefinition
}

type ManifestName =
  | typeof MIDDLEWARE_MANIFEST
  | typeof BUILD_MANIFEST
  | typeof PAGES_MANIFEST
  | typeof APP_PATHS_MANIFEST
  | `${typeof SERVER_REFERENCE_MANIFEST}.json`
  | `${typeof SUBRESOURCE_INTEGRITY_MANIFEST}.json`
  | `${typeof NEXT_FONT_MANIFEST}.json`
  | typeof REACT_LOADABLE_MANIFEST
  | typeof TURBOPACK_CLIENT_BUILD_MANIFEST

const getManifestPath = (
  page: string,
  distDir: string,
  name: ManifestName,
  type: string,
  firstCall: boolean
) => {
  let manifestPath = posix.join(
    distDir,
    `server`,
    type,
    type === 'middleware' || type === 'instrumentation'
      ? ''
      : type === 'app'
        ? page
        : getAssetPathFromRoute(page),
    name
  )

  if (firstCall) {
    const isSitemapRoute = /[\\/]sitemap(.xml)?\/route$/.test(page)
    // Check the ambiguity of /sitemap and /sitemap.xml
    if (isSitemapRoute && !existsSync(manifestPath)) {
      manifestPath = getManifestPath(
        page.replace(/\/sitemap\/route$/, '/sitemap.xml/route'),
        distDir,
        name,
        type,
        false
      )
    }
    // existsSync is faster than using the async version
    if (!existsSync(manifestPath) && page.endsWith('/route')) {
      // TODO: Improve implementation of metadata routes, currently it requires this extra check for the variants of the files that can be written.
      let basePage = removeRouteSuffix(page)
      // For sitemap.xml routes with generateSitemaps, the manifest is at
      // /sitemap/[__metadata_id__]/route (without .xml), because the route
      // handler serves at /sitemap/[id] not /sitemap.xml/[id]
      if (basePage.endsWith('/sitemap.xml')) {
        basePage = basePage.slice(0, -'.xml'.length)
      }
      let metadataPage = addRouteSuffix(addMetadataIdToRoute(basePage))
      manifestPath = getManifestPath(metadataPage, distDir, name, type, false)
    }
  }

  return manifestPath
}

function readPartialManifestContent(
  distDir: string,
  name: ManifestName,
  pageName: string,
  type: 'pages' | 'app' | 'middleware' | 'instrumentation' = 'pages'
): string {
  const page = pageName
  const manifestPath = getManifestPath(page, distDir, name, type, true)
  return readFileSync(posix.join(manifestPath), 'utf-8')
}

/// Helper class that stores a map of manifests and tracks if they have changed
/// since the last time they were written to disk. This is used to avoid
/// unnecessary writes to disk.
class ManifestsMap<K, V> {
  private rawMap = new Map<K, string>()
  private map = new Map<K, V>()
  private extraInvalidationKey: string | undefined = undefined
  private changed = true

  set(key: K, value: string) {
    if (this.rawMap.get(key) === value) return
    this.changed = true
    this.rawMap.set(key, value)
    this.map.set(key, JSON.parse(value))
  }

  delete(key: K) {
    if (this.map.has(key)) {
      this.changed = true
      this.rawMap.delete(key)
      this.map.delete(key)
    }
  }

  get(key: K) {
    return this.map.get(key)
  }

  takeChanged(extraInvalidationKey?: any) {
    let changed = this.changed
    if (extraInvalidationKey !== undefined) {
      const stringified = JSON.stringify(extraInvalidationKey)
      if (this.extraInvalidationKey !== stringified) {
        this.extraInvalidationKey = stringified
        changed = true
      }
    }
    this.changed = false
    return changed
  }

  values() {
    return this.map.values()
  }

  entries() {
    return this.map.entries()
  }
}

export class TurbopackManifestLoader {
  private actionManifests: ManifestsMap<EntryKey, ActionManifest> =
    new ManifestsMap()
  private appPathsManifests: ManifestsMap<EntryKey, PagesManifest> =
    new ManifestsMap()
  private buildManifests: ManifestsMap<EntryKey, BuildManifest> =
    new ManifestsMap()
  private clientBuildManifests: ManifestsMap<EntryKey, ClientBuildManifest> =
    new ManifestsMap()
  private fontManifests: ManifestsMap<EntryKey, NextFontManifest> =
    new ManifestsMap()
  private middlewareManifests: ManifestsMap<
    EntryKey,
    TurbopackMiddlewareManifest
  > = new ManifestsMap()
  private pagesManifests: ManifestsMap<string, PagesManifest> =
    new ManifestsMap()
  private sriManifests: ManifestsMap<EntryKey, SubresourceIntegrityManifest> =
    new ManifestsMap()
  private encryptionKey: string
  /// interceptionRewrites that have been written to disk
  /// This is used to avoid unnecessary writes if the rewrites haven't changed
  private cachedInterceptionRewrites: string | undefined = undefined
  private pendingCacheDeletes: string[] = []

  private readonly distDir: string
  private readonly buildId: string
  private readonly dev: boolean
  private readonly sriEnabled: boolean

  constructor({
    distDir,
    buildId,
    encryptionKey,
    dev,
    sriEnabled,
  }: {
    buildId: string
    distDir: string
    encryptionKey: string
    dev: boolean
    sriEnabled: boolean
  }) {
    this.distDir = distDir
    this.buildId = buildId
    this.encryptionKey = encryptionKey
    this.dev = dev
    this.sriEnabled = sriEnabled
  }

  delete(key: EntryKey) {
    this.actionManifests.delete(key)
    this.appPathsManifests.delete(key)
    this.buildManifests.delete(key)
    this.clientBuildManifests.delete(key)
    this.fontManifests.delete(key)
    this.middlewareManifests.delete(key)
    this.pagesManifests.delete(key)
  }

  loadActionManifest(pageName: string): void {
    this.actionManifests.set(
      getEntryKey('app', 'server', pageName),
      readPartialManifestContent(
        this.distDir,
        `${SERVER_REFERENCE_MANIFEST}.json`,
        pageName,
        'app'
      )
    )
  }

  private mergeActionManifests(manifests: Iterable<ActionManifest>) {
    type ActionEntries = ActionManifest['edge' | 'node']
    const manifest: ActionManifest = {
      node: {},
      edge: {},
      encryptionKey: this.encryptionKey,
    }

    function mergeActionIds(
      actionEntries: ActionEntries,
      other: ActionEntries
    ): void {
      for (const key in other) {
        const action = (actionEntries[key] ??= {
          workers: {},
        })
        action.filename = other[key].filename
        action.exportedName = other[key].exportedName
        Object.assign(action.workers, other[key].workers)
      }
    }

    for (const m of manifests) {
      mergeActionIds(manifest.node, m.node)
      mergeActionIds(manifest.edge, m.edge)
    }
    for (const key in manifest.node) {
      const entry = manifest.node[key]
      entry.workers = sortObjectByKey(entry.workers)
    }
    for (const key in manifest.edge) {
      const entry = manifest.edge[key]
      entry.workers = sortObjectByKey(entry.workers)
    }

    return manifest
  }

  private writeActionManifest(): void {
    if (!this.actionManifests.takeChanged()) {
      return
    }
    const actionManifest = this.mergeActionManifests(
      this.actionManifests.values()
    )
    const actionManifestJsonPath = join(
      this.distDir,
      'server',
      `${SERVER_REFERENCE_MANIFEST}.json`
    )
    const actionManifestJsPath = join(
      this.distDir,
      'server',
      `${SERVER_REFERENCE_MANIFEST}.js`
    )
    const json = JSON.stringify(actionManifest, null, 2)
    this.pendingCacheDeletes.push(actionManifestJsonPath)
    this.pendingCacheDeletes.push(actionManifestJsPath)
    writeFileAtomic(actionManifestJsonPath, json)
    writeFileAtomic(
      actionManifestJsPath,
      `self.__RSC_SERVER_MANIFEST=${JSON.stringify(json)}`
    )
  }

  loadAppPathsManifest(pageName: string): void {
    this.appPathsManifests.set(
      getEntryKey('app', 'server', pageName),
      readPartialManifestContent(
        this.distDir,
        APP_PATHS_MANIFEST,
        pageName,
        'app'
      )
    )
  }

  private writeAppPathsManifest(): void {
    if (!this.appPathsManifests.takeChanged()) {
      return
    }
    const appPathsManifest = this.mergePagesManifests(
      this.appPathsManifests.values()
    )
    const appPathsManifestPath = join(
      this.distDir,
      'server',
      APP_PATHS_MANIFEST
    )
    this.pendingCacheDeletes.push(appPathsManifestPath)
    writeFileAtomic(
      appPathsManifestPath,
      JSON.stringify(appPathsManifest, null, 2)
    )
  }

  private writeSriManifest(): void {
    if (!this.sriEnabled || !this.sriManifests.takeChanged()) {
      return
    }
    const sriManifest = this.mergeSriManifests(this.sriManifests.values())
    const pathJson = join(
      this.distDir,
      'server',
      `${SUBRESOURCE_INTEGRITY_MANIFEST}.json`
    )
    const pathJs = join(
      this.distDir,
      'server',
      `${SUBRESOURCE_INTEGRITY_MANIFEST}.js`
    )
    this.pendingCacheDeletes.push(pathJson)
    this.pendingCacheDeletes.push(pathJs)
    writeFileAtomic(pathJson, JSON.stringify(sriManifest, null, 2))
    writeFileAtomic(
      pathJs,
      `self.__SUBRESOURCE_INTEGRITY_MANIFEST=${JSON.stringify(
        JSON.stringify(sriManifest)
      )}`
    )
  }

  loadBuildManifest(pageName: string, type: 'app' | 'pages' = 'pages'): void {
    this.buildManifests.set(
      getEntryKey(type, 'server', pageName),
      readPartialManifestContent(this.distDir, BUILD_MANIFEST, pageName, type)
    )
  }

  loadClientBuildManifest(
    pageName: string,
    type: 'app' | 'pages' = 'pages'
  ): void {
    this.clientBuildManifests.set(
      getEntryKey(type, 'server', pageName),
      readPartialManifestContent(
        this.distDir,
        TURBOPACK_CLIENT_BUILD_MANIFEST,
        pageName,
        type
      )
    )
  }

  loadSriManifest(pageName: string, type: 'app' | 'pages' = 'pages'): void {
    if (!this.sriEnabled) return
    this.sriManifests.set(
      getEntryKey(type, 'client', pageName),
      readPartialManifestContent(
        this.distDir,
        `${SUBRESOURCE_INTEGRITY_MANIFEST}.json`,
        pageName,
        type
      )
    )
  }

  private mergeBuildManifests(
    manifests: Iterable<BuildManifest>,
    lowPriorityFiles: string[]
  ) {
    const manifest: Partial<BuildManifest> & Pick<BuildManifest, 'pages'> = {
      pages: {
        '/_app': [],
      },
      // Something in next.js depends on these to exist even for app dir rendering
      devFiles: [],
      polyfillFiles: [],
      lowPriorityFiles,
      rootMainFiles: [],
      rootMainFilesTree: {},
      pagesChunkGroupBootstrapParams: {},
    }
    for (const m of manifests) {
      Object.assign(manifest.pages, m.pages)
      if (m.rootMainFiles.length) manifest.rootMainFiles = m.rootMainFiles
      // polyfillFiles should always be the same, so we can overwrite instead of actually merging
      if (m.polyfillFiles.length) manifest.polyfillFiles = m.polyfillFiles
      if (m.rootMainFilesTree) {
        Object.assign(manifest.rootMainFilesTree!, m.rootMainFilesTree)
      }
      if (m.pagesChunkGroupBootstrapParams) {
        Object.assign(
          manifest.pagesChunkGroupBootstrapParams!,
          m.pagesChunkGroupBootstrapParams
        )
      }
      if (m.chunkLoadingGlobal)
        manifest.chunkLoadingGlobal = m.chunkLoadingGlobal
    }
    manifest.pages = sortObjectByKey(manifest.pages) as BuildManifest['pages']
    return manifest
  }

  private mergeClientBuildManifests(
    manifests: Iterable<ClientBuildManifest>,
    rewrites: CustomRoutes['rewrites'],
    sortedPageKeys: string[]
  ): ClientBuildManifest {
    const manifest = {
      __rewrites: rewrites as any,
      sortedPages: sortedPageKeys,
    }
    for (const m of manifests) {
      Object.assign(manifest, m)
    }
    return sortObjectByKey(manifest)
  }

  private writeInterceptionRouteRewriteManifest(
    devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined,
    productionRewrites: CustomRoutes['rewrites'] | undefined
  ): void {
    const rewrites = productionRewrites ?? {
      ...devRewrites,
      beforeFiles: (devRewrites?.beforeFiles ?? []).map(processRoute),
      afterFiles: (devRewrites?.afterFiles ?? []).map(processRoute),
      fallback: (devRewrites?.fallback ?? []).map(processRoute),
    }

    const interceptionRewrites = JSON.stringify(
      rewrites.beforeFiles.filter(
        (
          require('../../../lib/is-interception-route-rewrite') as typeof import('../../../lib/is-interception-route-rewrite')
        ).isInterceptionRouteRewrite
      )
    )

    if (this.cachedInterceptionRewrites === interceptionRewrites) {
      return
    }
    this.cachedInterceptionRewrites = interceptionRewrites

    const interceptionRewriteManifestPath = join(
      this.distDir,
      'server',
      `${INTERCEPTION_ROUTE_REWRITE_MANIFEST}.js`
    )
    this.pendingCacheDeletes.push(interceptionRewriteManifestPath)

    writeFileAtomic(
      interceptionRewriteManifestPath,
      `self.__INTERCEPTION_ROUTE_REWRITE_MANIFEST=${JSON.stringify(
        interceptionRewrites
      )};`
    )
  }

  private writeBuildManifest(lowPriorityFiles: string[]): void {
    if (!this.buildManifests.takeChanged()) {
      return
    }
    const buildManifest = this.mergeBuildManifests(
      this.buildManifests.values(),
      lowPriorityFiles
    )

    const buildManifestPath = join(this.distDir, BUILD_MANIFEST)
    const middlewareBuildManifestPath = join(
      this.distDir,
      'server',
      `${MIDDLEWARE_BUILD_MANIFEST}.js`
    )

    this.pendingCacheDeletes.push(buildManifestPath)
    this.pendingCacheDeletes.push(middlewareBuildManifestPath)
    writeFileAtomic(buildManifestPath, JSON.stringify(buildManifest, null, 2))
    writeFileAtomic(
      middlewareBuildManifestPath,
      createEdgeRuntimeManifest(buildManifest)
    )

    // Write fallback build manifest
    const fallbackBuildManifest = this.mergeBuildManifests(
      [
        this.buildManifests.get(getEntryKey('pages', 'server', '_app')),
        this.buildManifests.get(getEntryKey('pages', 'server', '_error')),
      ].filter(Boolean) as BuildManifest[],
      lowPriorityFiles
    )
    const fallbackBuildManifestPath = join(
      this.distDir,
      `fallback-${BUILD_MANIFEST}`
    )
    this.pendingCacheDeletes.push(fallbackBuildManifestPath)
    writeFileAtomic(
      fallbackBuildManifestPath,
      JSON.stringify(fallbackBuildManifest, null, 2)
    )
  }

  private writeClientBuildManifest(
    entrypoints: Entrypoints,
    devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined,
    productionRewrites: CustomRoutes['rewrites'] | undefined
  ): string[] {
    const rewrites = normalizeRewritesForBuildManifest(
      productionRewrites ?? {
        ...devRewrites,
        beforeFiles: (devRewrites?.beforeFiles ?? []).map(processRoute),
        afterFiles: (devRewrites?.afterFiles ?? []).map(processRoute),
        fallback: (devRewrites?.fallback ?? []).map(processRoute),
      }
    )

    const pagesKeys = [...entrypoints.page.keys()]
    if (entrypoints.global.app) {
      pagesKeys.push('/_app')
    }
    if (entrypoints.global.error) {
      pagesKeys.push('/_error')
    }

    const sortedPageKeys = getSortedRoutes(pagesKeys)

    let buildManifestPath = posix.join(
      CLIENT_STATIC_FILES_PATH,
      this.buildId,
      '_buildManifest.js'
    )
    let ssgManifestPath = posix.join(
      CLIENT_STATIC_FILES_PATH,
      this.buildId,
      '_ssgManifest.js'
    )

    if (
      this.dev &&
      !this.clientBuildManifests.takeChanged({ rewrites, sortedPageKeys })
    ) {
      return [buildManifestPath, ssgManifestPath]
    }

    const clientBuildManifest = this.mergeClientBuildManifests(
      this.clientBuildManifests.values(),
      rewrites,
      sortedPageKeys
    )

    // Expose each route's bootstrap params and the chunk-loading global to the client
    // so `route-loader` can instantiate a navigated page's entry module. The server
    // stores params as raw JSON per route.
    const pageBootstrapParams: Record<string, unknown> = {}
    let chunkLoadingGlobal: string | undefined
    for (const [key, m] of this.buildManifests.entries()) {
      // Only the pages-router `route-loader` reads `__TURBOPACK_PAGE_BOOTSTRAP`. App routes
      // navigate via flight and never use it, so skip app entries to keep `_buildManifest.js`
      // (loaded on every page) small.
      if (splitEntryKey(key).type !== 'pages') continue
      if (m.chunkLoadingGlobal) chunkLoadingGlobal = m.chunkLoadingGlobal
      for (const [route, params] of Object.entries(
        m.pagesChunkGroupBootstrapParams ?? {}
      )) {
        pageBootstrapParams[route] = params
      }
    }

    // Only emit the bootstrap globals when a route actually inlined its bootstrap (shared runtime
    // enabled).
    const hasBootstrapParams = Object.keys(pageBootstrapParams).length > 0
    const clientBuildManifestJs =
      `self.__BUILD_MANIFEST = ${JSON.stringify(clientBuildManifest, null, 2)};` +
      (hasBootstrapParams
        ? `self.__TURBOPACK_PAGE_BOOTSTRAP = ${JSON.stringify(pageBootstrapParams)};` +
          (chunkLoadingGlobal
            ? `self.__TURBOPACK_CHUNK_LOADING_GLOBAL = ${JSON.stringify(
                chunkLoadingGlobal
              )};`
            : '')
        : '') +
      `self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`

    writeFileAtomic(
      join(this.distDir, buildManifestPath),
      clientBuildManifestJs
    )
    // This is just an empty placeholder, the actual manifest is written after prerendering in
    // packages/next/src/build/index.ts
    writeFileAtomic(join(this.distDir, ssgManifestPath), srcEmptySsgManifest)

    return [buildManifestPath, ssgManifestPath]
  }

  loadFontManifest(pageName: string, type: 'app' | 'pages' = 'pages'): void {
    this.fontManifests.set(
      getEntryKey(type, 'server', pageName),
      readPartialManifestContent(
        this.distDir,
        `${NEXT_FONT_MANIFEST}.json`,
        pageName,
        type
      )
    )
  }

  private mergeFontManifests(manifests: Iterable<NextFontManifest>) {
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
    manifest.app = sortObjectByKey(manifest.app)
    manifest.pages = sortObjectByKey(manifest.pages)
    return manifest
  }

  private async writeNextFontManifest(): Promise<void> {
    if (!this.fontManifests.takeChanged()) {
      return
    }
    const fontManifest = this.mergeFontManifests(this.fontManifests.values())
    const json = JSON.stringify(fontManifest, null, 2)

    const fontManifestJsonPath = join(
      this.distDir,
      'server',
      `${NEXT_FONT_MANIFEST}.json`
    )
    const fontManifestJsPath = join(
      this.distDir,
      'server',
      `${NEXT_FONT_MANIFEST}.js`
    )
    this.pendingCacheDeletes.push(fontManifestJsonPath)
    this.pendingCacheDeletes.push(fontManifestJsPath)
    writeFileAtomic(fontManifestJsonPath, json)
    writeFileAtomic(
      fontManifestJsPath,
      `self.__NEXT_FONT_MANIFEST=${JSON.stringify(json)}`
    )
  }

  /**
   * @returns If the manifest was written or not
   */
  loadMiddlewareManifest(
    pageName: string,
    type: 'pages' | 'app' | 'middleware' | 'instrumentation'
  ): boolean {
    const middlewareManifestPath = getManifestPath(
      pageName,
      this.distDir,
      MIDDLEWARE_MANIFEST,
      type,
      true
    )

    // middlewareManifest is actually "edge manifest" and not all routes are edge runtime. If it is not written we skip it.
    if (!existsSync(middlewareManifestPath)) {
      return false
    }

    this.middlewareManifests.set(
      getEntryKey(
        type === 'middleware' || type === 'instrumentation' ? 'root' : type,
        'server',
        pageName
      ),
      readPartialManifestContent(
        this.distDir,
        MIDDLEWARE_MANIFEST,
        pageName,
        type
      )
    )

    return true
  }

  getMiddlewareManifest(key: EntryKey) {
    return this.middlewareManifests.get(key)
  }

  deleteMiddlewareManifest(key: EntryKey) {
    return this.middlewareManifests.delete(key)
  }

  private mergeMiddlewareManifests(
    manifests: Iterable<TurbopackMiddlewareManifest>
  ): MiddlewareManifest {
    const manifest: MiddlewareManifest = {
      version: 3,
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
    manifest.functions = sortObjectByKey(manifest.functions)
    manifest.middleware = sortObjectByKey(manifest.middleware)
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
          matcher.regexp = safePathToRegexp(matcher.originalSource, [], {
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

  private writeMiddlewareManifest(): {
    clientMiddlewareManifestPath: string
  } {
    let clientMiddlewareManifestPath = posix.join(
      CLIENT_STATIC_FILES_PATH,
      this.buildId,
      TURBOPACK_CLIENT_MIDDLEWARE_MANIFEST
    )

    if (this.dev && !this.middlewareManifests.takeChanged()) {
      return {
        clientMiddlewareManifestPath,
      }
    }
    const middlewareManifest = this.mergeMiddlewareManifests(
      this.middlewareManifests.values()
    )

    // Server middleware manifest

    // Normalize regexes as it uses path-to-regexp
    for (const key in middlewareManifest.middleware) {
      middlewareManifest.middleware[key].matchers.forEach((matcher) => {
        if (!matcher.regexp.startsWith('^')) {
          const parsedPage = tryToParsePath(matcher.regexp)
          if (parsedPage.error || !parsedPage.regexStr) {
            throw new Error(`Invalid source: ${matcher.regexp}`)
          }
          matcher.regexp = parsedPage.regexStr
        }
      })
    }

    const middlewareManifestPath = join(
      this.distDir,
      'server',
      MIDDLEWARE_MANIFEST
    )
    this.pendingCacheDeletes.push(middlewareManifestPath)
    writeFileAtomic(
      middlewareManifestPath,
      JSON.stringify(middlewareManifest, null, 2)
    )

    // Client middleware manifest This is only used in dev though, packages/next/src/build/index.ts
    // writes the mainfest again for builds.
    const matchers = middlewareManifest?.middleware['/']?.matchers || []

    const clientMiddlewareManifestJs = `self.__MIDDLEWARE_MATCHERS = ${JSON.stringify(
      matchers,
      null,
      2
    )};self.__MIDDLEWARE_MATCHERS_CB && self.__MIDDLEWARE_MATCHERS_CB()`

    this.pendingCacheDeletes.push(clientMiddlewareManifestPath)
    writeFileAtomic(
      join(this.distDir, clientMiddlewareManifestPath),
      clientMiddlewareManifestJs
    )

    return {
      clientMiddlewareManifestPath,
    }
  }

  loadPagesManifest(pageName: string): void {
    this.pagesManifests.set(
      getEntryKey('pages', 'server', pageName),
      readPartialManifestContent(this.distDir, PAGES_MANIFEST, pageName)
    )
  }

  private mergePagesManifests(manifests: Iterable<PagesManifest>) {
    const manifest: PagesManifest = {}
    for (const m of manifests) {
      Object.assign(manifest, m)
    }
    return sortObjectByKey(manifest)
  }

  private mergeSriManifests(manifests: Iterable<SubresourceIntegrityManifest>) {
    const manifest: SubresourceIntegrityManifest = {}
    for (const m of manifests) {
      Object.assign(manifest, m)
    }
    return sortObjectByKey(manifest)
  }

  private writePagesManifest(): void {
    if (!this.pagesManifests.takeChanged()) {
      return
    }
    const pagesManifest = this.mergePagesManifests(this.pagesManifests.values())
    const pagesManifestPath = join(this.distDir, 'server', PAGES_MANIFEST)
    this.pendingCacheDeletes.push(pagesManifestPath)
    writeFileAtomic(pagesManifestPath, JSON.stringify(pagesManifest, null, 2))
  }

  writeManifests({
    devRewrites,
    productionRewrites,
    entrypoints,
  }: {
    devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined
    productionRewrites: CustomRoutes['rewrites'] | undefined
    entrypoints: Entrypoints
  }): void {
    this.writeActionManifest()
    this.writeAppPathsManifest()
    const lowPriorityFiles = this.writeClientBuildManifest(
      entrypoints,
      devRewrites,
      productionRewrites
    )
    const { clientMiddlewareManifestPath } = this.writeMiddlewareManifest()
    this.writeBuildManifest([...lowPriorityFiles, clientMiddlewareManifestPath])
    this.writeInterceptionRouteRewriteManifest(devRewrites, productionRewrites)
    this.writeNextFontManifest()
    this.writePagesManifest()

    this.writeSriManifest()

    // Flush all queued cache deletions in a single require.cache scan
    if (this.pendingCacheDeletes.length > 0) {
      deleteCache(this.pendingCacheDeletes)
      this.pendingCacheDeletes = []
    }
  }
}

function sortObjectByKey(obj: Record<string, any>) {
  return Object.keys(obj)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = obj[key]
        return acc
      },
      {} as Record<string, any>
    )
}
