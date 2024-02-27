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
import type { PageEntrypoints } from './types'
import getAssetPathFromRoute from '../../../shared/lib/router/utils/get-asset-path-from-route'
import { getEntryKey, type EntryKey } from './entry-key'

interface InstrumentationDefinition {
  files: string[]
  name: 'instrumentation'
}

type TurbopackMiddlewareManifest = MiddlewareManifest & {
  instrumentation?: InstrumentationDefinition
}

async function readPartialManifest<T>(
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
  type: 'pages' | 'app' | 'middleware' | 'instrumentation' = 'pages'
): Promise<T> {
  const manifestPath = posix.join(
    distDir,
    `server`,
    type,
    type === 'middleware' || type === 'instrumentation'
      ? ''
      : type === 'app'
      ? pageName
      : getAssetPathFromRoute(pageName),
    name
  )
  return JSON.parse(await readFile(posix.join(manifestPath), 'utf-8')) as T
}

export class TurbopackManifestLoader {
  private actionManifests: Map<EntryKey, ActionManifest> = new Map()
  private appBuildManifests: Map<EntryKey, AppBuildManifest> = new Map()
  private appPathsManifests: Map<EntryKey, PagesManifest> = new Map()
  private buildManifests: Map<EntryKey, BuildManifest> = new Map()
  private fontManifests: Map<EntryKey, NextFontManifest> = new Map()
  private loadableManifests: Map<EntryKey, LoadableManifest> = new Map()
  private middlewareManifests: Map<EntryKey, TurbopackMiddlewareManifest> =
    new Map()
  private pagesManifests: Map<string, PagesManifest> = new Map()

  private readonly distDir: string
  private readonly buildId: string

  constructor({ distDir, buildId }: { buildId: string; distDir: string }) {
    this.distDir = distDir
    this.buildId = buildId
  }

  delete(key: EntryKey) {
    this.actionManifests.delete(key)
    this.appBuildManifests.delete(key)
    this.appPathsManifests.delete(key)
    this.buildManifests.delete(key)
    this.fontManifests.delete(key)
    this.loadableManifests.delete(key)
    this.middlewareManifests.delete(key)
    this.pagesManifests.delete(key)
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
    await writeFile(actionManifestJsonPath, json, 'utf-8')
    await writeFile(
      actionManifestJsPath,
      `self.__RSC_SERVER_MANIFEST=${JSON.stringify(json)}`,
      'utf-8'
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

  /**
   * Turbopack doesn't support this functionality, so it writes an empty manifest.
   */
  private async writeAutomaticFontOptimizationManifest() {
    const manifestPath = join(
      this.distDir,
      'server',
      AUTOMATIC_FONT_OPTIMIZATION_MANIFEST
    )

    await writeFileAtomic(manifestPath, JSON.stringify([]))
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

  private async writeBuildManifest(
    pageEntrypoints: PageEntrypoints,
    rewrites: SetupOpts['fsChecker']['rewrites']
  ): Promise<void> {
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
        [...pageEntrypoints.keys()].map((pathname) => [
          pathname,
          `static/chunks/pages${pathname === '/' ? '/index' : pathname}.js`,
        ])
      ),
      sortedPages: [...pageEntrypoints.keys()],
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

  async loadLoadableManifest(
    pageName: string,
    type: 'app' | 'pages' = 'pages'
  ): Promise<void> {
    this.loadableManifests.set(
      getEntryKey(type, 'server', pageName),
      await readPartialManifest(
        this.distDir,
        REACT_LOADABLE_MANIFEST,
        pageName,
        type
      )
    )
  }

  private mergeLoadableManifests(manifests: Iterable<LoadableManifest>) {
    const manifest: LoadableManifest = {}
    for (const m of manifests) {
      Object.assign(manifest, m)
    }
    return manifest
  }

  private async writeLoadableManifest(): Promise<void> {
    const loadableManifest = this.mergeLoadableManifests(
      this.loadableManifests.values()
    )
    const loadableManifestPath = join(this.distDir, REACT_LOADABLE_MANIFEST)
    const middlewareloadableManifestPath = join(
      this.distDir,
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

  private async writeMiddlewareManifest(): Promise<void> {
    const middlewareManifest = this.mergeMiddlewareManifests(
      this.middlewareManifests.values()
    )
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
    rewrites,
    pageEntrypoints,
  }: {
    rewrites: SetupOpts['fsChecker']['rewrites']
    pageEntrypoints: PageEntrypoints
  }) {
    await this.writeActionManifest()
    await this.writeAppBuildManifest()
    await this.writeAppPathsManifest()
    await this.writeAutomaticFontOptimizationManifest()
    await this.writeBuildManifest(pageEntrypoints, rewrites)
    await this.writeFallbackBuildManifest()
    await this.writeLoadableManifest()
    await this.writeMiddlewareManifest()
    await this.writeNextFontManifest()
    await this.writePagesManifest()
  }
}
