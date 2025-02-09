import type {
  EdgeFunctionDefinition,
  MiddlewareManifest,
} from '../../../build/webpack/plugins/middleware-plugin'
import type {
  StatsAsset,
  StatsChunk,
  StatsChunkGroup,
  StatsModule,
  StatsCompilation as WebpackStats,
} from 'webpack'
import type { BuildManifest } from '../../../server/get-page-files'
import type { AppBuildManifest } from '../../../build/webpack/plugins/app-build-manifest-plugin'
import type { PagesManifest } from '../../../build/webpack/plugins/pages-manifest-plugin'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import type { ActionManifest } from '../../../build/webpack/plugins/flight-client-entry-plugin'
import type { NextFontManifest } from '../../../build/webpack/plugins/next-font-manifest-plugin'
import type { REACT_LOADABLE_MANIFEST } from '../constants'
import {
  APP_BUILD_MANIFEST,
  APP_PATHS_MANIFEST,
  BUILD_MANIFEST,
  INTERCEPTION_ROUTE_REWRITE_MANIFEST,
  MIDDLEWARE_BUILD_MANIFEST,
  MIDDLEWARE_MANIFEST,
  NEXT_FONT_MANIFEST,
  PAGES_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  TURBOPACK_CLIENT_MIDDLEWARE_MANIFEST,
  WEBPACK_STATS,
} from '../constants'
import { join, posix } from 'path'
import { readFile } from 'fs/promises'
import type { SetupOpts } from '../../../server/lib/router-utils/setup-dev-bundler'
import { deleteCache } from '../../../server/dev/require-cache'
import { writeFileAtomic } from '../../../lib/fs/write-atomic'
import { isInterceptionRouteRewrite } from '../../../lib/generate-interception-routes-rewrites'
import {
  type ClientBuildManifest,
  normalizeRewritesForBuildManifest,
  srcEmptySsgManifest,
  processRoute,
} from '../../../build/webpack/plugins/build-manifest-plugin'
import getAssetPathFromRoute from '../router/utils/get-asset-path-from-route'
import { getEntryKey, type EntryKey } from './entry-key'
import type { CustomRoutes } from '../../../lib/load-custom-routes'
import { getSortedRoutes } from '../router/utils'
import { existsSync } from 'fs'
import {
  addMetadataIdToRoute,
  addRouteSuffix,
  removeRouteSuffix,
} from '../../../server/dev/turbopack-utils'
import { tryToParsePath } from '../../../lib/try-to-parse-path'
import type { Entrypoints } from '../../../build/swc/types'

interface InstrumentationDefinition {
  files: string[]
  name: 'instrumentation'
}

type TurbopackMiddlewareManifest = MiddlewareManifest & {
  instrumentation?: InstrumentationDefinition
}

const getManifestPath = (
  page: string,
  distDir: string,
  name: string,
  type: string
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
  return manifestPath
}

async function readPartialManifest<T>(
  distDir: string,
  name:
    | typeof MIDDLEWARE_MANIFEST
    | typeof BUILD_MANIFEST
    | typeof APP_BUILD_MANIFEST
    | typeof PAGES_MANIFEST
    | typeof WEBPACK_STATS
    | typeof APP_PATHS_MANIFEST
    | `${typeof SERVER_REFERENCE_MANIFEST}.json`
    | `${typeof NEXT_FONT_MANIFEST}.json`
    | typeof REACT_LOADABLE_MANIFEST,
  pageName: string,
  type: 'pages' | 'app' | 'middleware' | 'instrumentation' = 'pages'
): Promise<T> {
  const page = pageName
  const isSitemapRoute = /[\\/]sitemap(.xml)?\/route$/.test(page)
  let manifestPath = getManifestPath(page, distDir, name, type)

  // Check the ambiguity of /sitemap and /sitemap.xml
  if (isSitemapRoute && !existsSync(manifestPath)) {
    manifestPath = getManifestPath(
      pageName.replace(/\/sitemap\/route$/, '/sitemap.xml/route'),
      distDir,
      name,
      type
    )
  }
  // existsSync is faster than using the async version
  if (!existsSync(manifestPath) && page.endsWith('/route')) {
    // TODO: Improve implementation of metadata routes, currently it requires this extra check for the variants of the files that can be written.
    let metadataPage = addRouteSuffix(
      addMetadataIdToRoute(removeRouteSuffix(page))
    )
    manifestPath = getManifestPath(metadataPage, distDir, name, type)
  }
  return JSON.parse(await readFile(posix.join(manifestPath), 'utf-8')) as T
}

export class TurbopackManifestLoader {
  private actionManifests: Map<EntryKey, ActionManifest> = new Map()
  private appBuildManifests: Map<EntryKey, AppBuildManifest> = new Map()
  private appPathsManifests: Map<EntryKey, PagesManifest> = new Map()
  private buildManifests: Map<EntryKey, BuildManifest> = new Map()
  private fontManifests: Map<EntryKey, NextFontManifest> = new Map()
  private middlewareManifests: Map<EntryKey, TurbopackMiddlewareManifest> =
    new Map()
  private pagesManifests: Map<string, PagesManifest> = new Map()
  private webpackStats: Map<EntryKey, WebpackStats> = new Map()
  private encryptionKey: string

  private readonly distDir: string
  private readonly buildId: string

  constructor({
    distDir,
    buildId,
    encryptionKey,
  }: {
    buildId: string
    distDir: string
    encryptionKey: string
  }) {
    this.distDir = distDir
    this.buildId = buildId
    this.encryptionKey = encryptionKey
  }

  delete(key: EntryKey) {
    this.actionManifests.delete(key)
    this.appBuildManifests.delete(key)
    this.appPathsManifests.delete(key)
    this.buildManifests.delete(key)
    this.fontManifests.delete(key)
    this.middlewareManifests.delete(key)
    this.pagesManifests.delete(key)
    this.webpackStats.delete(key)
  }

  async loadActionManifest(pageName: string): Promise<void> {
    this.actionManifests.set(
      getEntryKey('app', 'server', pageName),
      await readPartialManifest(
        this.distDir,
        `${SERVER_REFERENCE_MANIFEST}.json`,
        pageName,
        'app'
      )
    )
  }

  private async mergeActionManifests(manifests: Iterable<ActionManifest>) {
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

  private async writeActionManifest(): Promise<void> {
    const actionManifest = await this.mergeActionManifests(
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
    deleteCache(actionManifestJsonPath)
    deleteCache(actionManifestJsPath)
    await writeFileAtomic(actionManifestJsonPath, json)
    await writeFileAtomic(
      actionManifestJsPath,
      `self.__RSC_SERVER_MANIFEST=${JSON.stringify(json)}`
    )
  }

  async loadAppBuildManifest(pageName: string): Promise<void> {
    this.appBuildManifests.set(
      getEntryKey('app', 'server', pageName),
      await readPartialManifest(
        this.distDir,
        APP_BUILD_MANIFEST,
        pageName,
        'app'
      )
    )
  }

  private mergeAppBuildManifests(manifests: Iterable<AppBuildManifest>) {
    const manifest: AppBuildManifest = {
      pages: {},
    }
    for (const m of manifests) {
      Object.assign(manifest.pages, m.pages)
    }
    return manifest
  }

  private async writeAppBuildManifest(): Promise<void> {
    const appBuildManifest = this.mergeAppBuildManifests(
      this.appBuildManifests.values()
    )
    const appBuildManifestPath = join(this.distDir, APP_BUILD_MANIFEST)
    deleteCache(appBuildManifestPath)
    await writeFileAtomic(
      appBuildManifestPath,
      JSON.stringify(appBuildManifest, null, 2)
    )
  }

  async loadAppPathsManifest(pageName: string): Promise<void> {
    this.appPathsManifests.set(
      getEntryKey('app', 'server', pageName),
      await readPartialManifest(
        this.distDir,
        APP_PATHS_MANIFEST,
        pageName,
        'app'
      )
    )
  }

  private async writeAppPathsManifest(): Promise<void> {
    const appPathsManifest = this.mergePagesManifests(
      this.appPathsManifests.values()
    )
    const appPathsManifestPath = join(
      this.distDir,
      'server',
      APP_PATHS_MANIFEST
    )
    deleteCache(appPathsManifestPath)
    await writeFileAtomic(
      appPathsManifestPath,
      JSON.stringify(appPathsManifest, null, 2)
    )
  }

  private async writeWebpackStats(): Promise<void> {
    const webpackStats = this.mergeWebpackStats(this.webpackStats.values())
    const path = join(this.distDir, 'server', WEBPACK_STATS)
    deleteCache(path)
    await writeFileAtomic(path, JSON.stringify(webpackStats, null, 2))
  }

  async loadBuildManifest(
    pageName: string,
    type: 'app' | 'pages' = 'pages'
  ): Promise<void> {
    this.buildManifests.set(
      getEntryKey(type, 'server', pageName),
      await readPartialManifest(this.distDir, BUILD_MANIFEST, pageName, type)
    )
  }

  async loadWebpackStats(
    pageName: string,
    type: 'app' | 'pages' = 'pages'
  ): Promise<void> {
    this.webpackStats.set(
      getEntryKey(type, 'client', pageName),
      await readPartialManifest(this.distDir, WEBPACK_STATS, pageName, type)
    )
  }

  private mergeWebpackStats(statsFiles: Iterable<WebpackStats>): WebpackStats {
    const entrypoints: Record<string, StatsChunkGroup> = {}
    const assets: Map<string, StatsAsset> = new Map()
    const chunks: Map<string, StatsChunk> = new Map()
    const modules: Map<string | number, StatsModule> = new Map()

    for (const statsFile of statsFiles) {
      if (statsFile.entrypoints) {
        for (const [k, v] of Object.entries(statsFile.entrypoints)) {
          if (!entrypoints[k]) {
            entrypoints[k] = v
          }
        }
      }

      if (statsFile.assets) {
        for (const asset of statsFile.assets) {
          if (!assets.has(asset.name)) {
            assets.set(asset.name, asset)
          }
        }
      }

      if (statsFile.chunks) {
        for (const chunk of statsFile.chunks) {
          if (!chunks.has(chunk.name)) {
            chunks.set(chunk.name, chunk)
          }
        }
      }

      if (statsFile.modules) {
        for (const module of statsFile.modules) {
          const id = module.id
          if (id != null) {
            // Merge the chunk list for the module. This can vary across endpoints.
            const existing = modules.get(id)
            if (existing == null) {
              modules.set(id, module)
            } else if (module.chunks != null && existing.chunks != null) {
              for (const chunk of module.chunks) {
                if (!existing.chunks.includes(chunk)) {
                  existing.chunks.push(chunk)
                }
              }
            }
          }
        }
      }
    }

    return {
      entrypoints,
      assets: [...assets.values()],
      chunks: [...chunks.values()],
      modules: [...modules.values()],
    }
  }

  private mergeBuildManifests(manifests: Iterable<BuildManifest>) {
    const manifest: Partial<BuildManifest> & Pick<BuildManifest, 'pages'> = {
      pages: {
        '/_app': [],
      },
      // Something in next.js depends on these to exist even for app dir rendering
      devFiles: [],
      ampDevFiles: [],
      polyfillFiles: [],
      lowPriorityFiles: [
        `static/${this.buildId}/_ssgManifest.js`,
        `static/${this.buildId}/_buildManifest.js`,
      ],
      rootMainFiles: [],
      ampFirstPages: [],
    }
    for (const m of manifests) {
      Object.assign(manifest.pages, m.pages)
      if (m.rootMainFiles.length) manifest.rootMainFiles = m.rootMainFiles
      // polyfillFiles should always be the same, so we can overwrite instead of actually merging
      if (m.polyfillFiles.length) manifest.polyfillFiles = m.polyfillFiles
    }
    return manifest
  }

  private async writeBuildManifest(
    entrypoints: Entrypoints,
    devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined,
    productionRewrites: CustomRoutes['rewrites'] | undefined
  ): Promise<void> {
    const rewrites = productionRewrites ?? {
      ...devRewrites,
      beforeFiles: (devRewrites?.beforeFiles ?? []).map(processRoute),
      afterFiles: (devRewrites?.afterFiles ?? []).map(processRoute),
      fallback: (devRewrites?.fallback ?? []).map(processRoute),
    }
    const buildManifest = this.mergeBuildManifests(this.buildManifests.values())
    const buildManifestPath = join(this.distDir, BUILD_MANIFEST)
    const middlewareBuildManifestPath = join(
      this.distDir,
      'server',
      `${MIDDLEWARE_BUILD_MANIFEST}.js`
    )
    const interceptionRewriteManifestPath = join(
      this.distDir,
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
      // we use globalThis here because middleware can be node
      // which doesn't have "self"
      `globalThis.__BUILD_MANIFEST=${JSON.stringify(buildManifest)};`
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

    const pagesKeys = [...entrypoints.page.keys()]
    if (entrypoints.global.app) {
      pagesKeys.push('/_app')
    }
    if (entrypoints.global.error) {
      pagesKeys.push('/_error')
    }

    const sortedPageKeys = getSortedRoutes(pagesKeys)
    const content: ClientBuildManifest = {
      __rewrites: normalizeRewritesForBuildManifest(rewrites) as any,
      ...Object.fromEntries(
        sortedPageKeys.map((pathname) => [
          pathname,
          [`static/chunks/pages${pathname === '/' ? '/index' : pathname}.js`],
        ])
      ),
      sortedPages: sortedPageKeys,
    }
    const buildManifestJs = `self.__BUILD_MANIFEST = ${JSON.stringify(
      content
    )};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()`
    await writeFileAtomic(
      join(this.distDir, 'static', this.buildId, '_buildManifest.js'),
      buildManifestJs
    )
    await writeFileAtomic(
      join(this.distDir, 'static', this.buildId, '_ssgManifest.js'),
      srcEmptySsgManifest
    )
  }

  private async writeClientMiddlewareManifest(): Promise<void> {
    const middlewareManifest = this.mergeMiddlewareManifests(
      this.middlewareManifests.values()
    )

    const matchers = middlewareManifest?.middleware['/']?.matchers || []

    const clientMiddlewareManifestPath = join(
      this.distDir,
      'static',
      this.buildId,
      `${TURBOPACK_CLIENT_MIDDLEWARE_MANIFEST}`
    )
    deleteCache(clientMiddlewareManifestPath)
    await writeFileAtomic(
      clientMiddlewareManifestPath,
      JSON.stringify(matchers, null, 2)
    )
  }

  private async writeFallbackBuildManifest(): Promise<void> {
    const fallbackBuildManifest = this.mergeBuildManifests(
      [
        this.buildManifests.get(getEntryKey('pages', 'server', '_app')),
        this.buildManifests.get(getEntryKey('pages', 'server', '_error')),
      ].filter(Boolean) as BuildManifest[]
    )
    const fallbackBuildManifestPath = join(
      this.distDir,
      `fallback-${BUILD_MANIFEST}`
    )
    deleteCache(fallbackBuildManifestPath)
    await writeFileAtomic(
      fallbackBuildManifestPath,
      JSON.stringify(fallbackBuildManifest, null, 2)
    )
  }

  async loadFontManifest(
    pageName: string,
    type: 'app' | 'pages' = 'pages'
  ): Promise<void> {
    this.fontManifests.set(
      getEntryKey(type, 'server', pageName),
      await readPartialManifest(
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
    return manifest
  }

  private async writeNextFontManifest(): Promise<void> {
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
    deleteCache(fontManifestJsonPath)
    deleteCache(fontManifestJsPath)
    await writeFileAtomic(fontManifestJsonPath, json)
    await writeFileAtomic(
      fontManifestJsPath,
      `self.__NEXT_FONT_MANIFEST=${JSON.stringify(json)}`
    )
  }

  async loadMiddlewareManifest(
    pageName: string,
    type: 'pages' | 'app' | 'middleware' | 'instrumentation'
  ): Promise<void> {
    this.middlewareManifests.set(
      getEntryKey(
        type === 'middleware' || type === 'instrumentation' ? 'root' : type,
        'server',
        pageName
      ),
      await readPartialManifest(
        this.distDir,
        MIDDLEWARE_MANIFEST,
        pageName,
        type
      )
    )
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

  private async writeMiddlewareManifest(): Promise<void> {
    const middlewareManifest = this.mergeMiddlewareManifests(
      this.middlewareManifests.values()
    )

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
    deleteCache(middlewareManifestPath)
    await writeFileAtomic(
      middlewareManifestPath,
      JSON.stringify(middlewareManifest, null, 2)
    )
  }

  async loadPagesManifest(pageName: string): Promise<void> {
    this.pagesManifests.set(
      getEntryKey('pages', 'server', pageName),
      await readPartialManifest(this.distDir, PAGES_MANIFEST, pageName)
    )
  }

  private mergePagesManifests(manifests: Iterable<PagesManifest>) {
    const manifest: PagesManifest = {}
    for (const m of manifests) {
      Object.assign(manifest, m)
    }
    return manifest
  }

  private async writePagesManifest(): Promise<void> {
    const pagesManifest = this.mergePagesManifests(this.pagesManifests.values())
    const pagesManifestPath = join(this.distDir, 'server', PAGES_MANIFEST)
    deleteCache(pagesManifestPath)
    await writeFileAtomic(
      pagesManifestPath,
      JSON.stringify(pagesManifest, null, 2)
    )
  }

  async writeManifests({
    devRewrites,
    productionRewrites,
    entrypoints,
  }: {
    devRewrites: SetupOpts['fsChecker']['rewrites'] | undefined
    productionRewrites: CustomRoutes['rewrites'] | undefined
    entrypoints: Entrypoints
  }) {
    await this.writeActionManifest()
    await this.writeAppBuildManifest()
    await this.writeAppPathsManifest()
    await this.writeBuildManifest(entrypoints, devRewrites, productionRewrites)
    await this.writeFallbackBuildManifest()
    await this.writeMiddlewareManifest()
    await this.writeClientMiddlewareManifest()
    await this.writeNextFontManifest()
    await this.writePagesManifest()

    if (process.env.TURBOPACK_STATS != null) {
      await this.writeWebpackStats()
    }
  }
}
