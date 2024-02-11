import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import type { ActionManifest } from '../../../build/webpack/plugins/flight-client-entry-plugin'
import type { NextFontManifest } from '../../../build/webpack/plugins/next-font-manifest-plugin'
import { generateRandomActionKeyRaw } from '../../app-render/action-encryption-utils'
import type { LoadableManifest } from '../../load-components'
import type {
  EdgeFunctionDefinition,
  MiddlewareManifest,
} from '../../../build/webpack/plugins/middleware-plugin'
import type { PagesManifest } from '../../../build/webpack/plugins/pages-manifest-plugin'
import type { AppBuildManifest } from '../../../build/webpack/plugins/app-build-manifest-plugin'
import type { BuildManifest } from '../../get-page-files'

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
