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
import { posix } from 'path'
import { readFile } from 'fs/promises'
import type {
  APP_BUILD_MANIFEST,
  APP_PATHS_MANIFEST,
  BUILD_MANIFEST,
  MIDDLEWARE_MANIFEST,
  NEXT_FONT_MANIFEST,
  PAGES_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  REACT_LOADABLE_MANIFEST,
} from '../../shared/lib/constants'

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
