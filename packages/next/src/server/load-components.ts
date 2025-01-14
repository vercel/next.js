import type {
  AppType,
  DocumentType,
  NextComponentType,
} from '../shared/lib/utils'
import type { ClientReferenceManifest } from '../build/webpack/plugins/flight-manifest-plugin'
import type {
  PageConfig,
  GetStaticPaths,
  GetServerSideProps,
  GetStaticProps,
} from '../types'
import type { RouteModule } from './route-modules/route-module'
import type { BuildManifest } from './get-page-files'
import type { ActionManifest } from '../build/webpack/plugins/flight-client-entry-plugin'

import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  CLIENT_REFERENCE_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  DYNAMIC_CSS_MANIFEST,
  SUBRESOURCE_INTEGRITY_MANIFEST,
} from '../shared/lib/constants'
import { join } from 'path'
import { requirePage } from './require'
import { interopDefault } from '../lib/interop-default'
import { getTracer } from './lib/trace/tracer'
import { LoadComponentsSpan } from './lib/trace/constants'
import { evalManifest, loadManifest } from './load-manifest'
import { wait } from '../lib/wait'
import { setReferenceManifestsSingleton } from './app-render/encryption-utils'
import { createServerModuleMap } from './app-render/action-utils'
import type { DeepReadonly } from '../shared/lib/deep-readonly'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'

export type ManifestItem = {
  id: number | string
  files: string[]
}

export type ReactLoadableManifest = { [moduleId: string]: ManifestItem }
/**
 * This manifest prevents removing server rendered <link> tags after client
 * navigation. This is only needed under `Pages dir && Production && Webpack`.
 * @see https://github.com/vercel/next.js/pull/72959
 */
export type DynamicCssManifest = string[]

/**
 * A manifest entry type for the react-loadable-manifest.json.
 *
 * The whole manifest.json is a type of `Record<pathname, LoadableManifest>`
 * where pathname is a string-based key points to the path of the page contains
 * each dynamic imports.
 */
export interface LoadableManifest {
  [k: string]: { id: string | number; files: string[] }
}

export type LoadComponentsReturnType<NextModule = any> = {
  Component: NextComponentType
  pageConfig: PageConfig
  buildManifest: DeepReadonly<BuildManifest>
  subresourceIntegrityManifest?: DeepReadonly<Record<string, string>>
  reactLoadableManifest: DeepReadonly<ReactLoadableManifest>
  dynamicCssManifest?: DeepReadonly<DynamicCssManifest>
  clientReferenceManifest?: DeepReadonly<ClientReferenceManifest>
  serverActionsManifest?: any
  Document: DocumentType
  App: AppType
  getStaticProps?: GetStaticProps
  getStaticPaths?: GetStaticPaths
  getServerSideProps?: GetServerSideProps
  ComponentMod: NextModule
  routeModule: RouteModule
  isAppPath?: boolean
  page: string
  multiZoneDraftMode?: boolean
}

/**
 * Load manifest file with retries, defaults to 3 attempts.
 */
export async function loadManifestWithRetries<T extends object>(
  manifestPath: string,
  attempts = 3
) {
  while (true) {
    try {
      return loadManifest<T>(manifestPath)
    } catch (err) {
      attempts--
      if (attempts <= 0) throw err

      await wait(100)
    }
  }
}

/**
 * Load manifest file with retries, defaults to 3 attempts, or return undefined.
 */
export async function tryLoadManifestWithRetries<T extends object>(
  manifestPath: string,
  attempts = 3
) {
  try {
    return await loadManifestWithRetries<T>(manifestPath, attempts)
  } catch (err) {
    return undefined
  }
}

/**
 * Load manifest file with retries, defaults to 3 attempts.
 */
export async function evalManifestWithRetries<T extends object>(
  manifestPath: string,
  attempts = 3
) {
  while (true) {
    try {
      return evalManifest<T>(manifestPath)
    } catch (err) {
      attempts--
      if (attempts <= 0) throw err

      await wait(100)
    }
  }
}

async function tryLoadClientReferenceManifest(
  manifestPath: string,
  entryName: string,
  attempts?: number
) {
  try {
    const context = await evalManifestWithRetries<{
      __RSC_MANIFEST: { [key: string]: ClientReferenceManifest }
    }>(manifestPath, attempts)
    return context.__RSC_MANIFEST[entryName]
  } catch (err) {
    return undefined
  }
}

async function loadComponentsImpl<N = any>({
  distDir,
  page,
  isAppPath,
  isDev,
  sriEnabled,
}: {
  distDir: string
  page: string
  isAppPath: boolean
  isDev: boolean
  sriEnabled: boolean
}): Promise<LoadComponentsReturnType<N>> {
  let DocumentMod = {}
  let AppMod = {}
  if (!isAppPath) {
    ;[DocumentMod, AppMod] = await Promise.all([
      requirePage('/_document', distDir, false),
      requirePage('/_app', distDir, false),
    ])
  }

  // In dev mode we retry loading a manifest file to handle a race condition
  // that can occur while app and pages are compiling at the same time, and the
  // build-manifest is still being written to disk while an app path is
  // attempting to load.
  const manifestLoadAttempts = isDev ? 3 : 1

  let reactLoadableManifestPath
  if (!process.env.TURBOPACK) {
    reactLoadableManifestPath = join(distDir, REACT_LOADABLE_MANIFEST)
  } else if (isAppPath) {
    reactLoadableManifestPath = join(
      distDir,
      'server',
      'app',
      page,
      REACT_LOADABLE_MANIFEST
    )
  } else {
    reactLoadableManifestPath = join(
      distDir,
      'server',
      'pages',
      normalizePagePath(page),
      REACT_LOADABLE_MANIFEST
    )
  }

  // Load the manifest files first
  //
  // Loading page-specific manifests shouldn't throw an error if the manifest couldn't be found, so
  // that the `requirePage` call below will throw the correct error in that case
  // (a `PageNotFoundError`).
  const [
    buildManifest,
    reactLoadableManifest,
    dynamicCssManifest,
    clientReferenceManifest,
    serverActionsManifest,
    subresourceIntegrityManifest,
  ] = await Promise.all([
    loadManifestWithRetries<BuildManifest>(
      join(distDir, BUILD_MANIFEST),
      manifestLoadAttempts
    ),
    tryLoadManifestWithRetries<ReactLoadableManifest>(
      reactLoadableManifestPath,
      manifestLoadAttempts
    ),
    // This manifest will only exist in Pages dir && Production && Webpack.
    isAppPath || process.env.TURBOPACK
      ? undefined
      : loadManifestWithRetries<DynamicCssManifest>(
          join(distDir, `${DYNAMIC_CSS_MANIFEST}.json`),
          manifestLoadAttempts
        ).catch(() => undefined),
    isAppPath
      ? tryLoadClientReferenceManifest(
          join(
            distDir,
            'server',
            'app',
            page.replace(/%5F/g, '_') + '_' + CLIENT_REFERENCE_MANIFEST + '.js'
          ),
          page.replace(/%5F/g, '_'),
          manifestLoadAttempts
        )
      : undefined,
    isAppPath
      ? loadManifestWithRetries<ActionManifest>(
          join(distDir, 'server', SERVER_REFERENCE_MANIFEST + '.json'),
          manifestLoadAttempts
        ).catch(() => null)
      : null,
    sriEnabled
      ? loadManifestWithRetries<DeepReadonly<Record<string, string>>>(
          join(distDir, 'server', SUBRESOURCE_INTEGRITY_MANIFEST + '.json')
        ).catch(() => undefined)
      : undefined,
  ])

  // Before requiring the actual page module, we have to set the reference
  // manifests to our global store so Server Action's encryption util can access
  // to them at the top level of the page module.
  if (serverActionsManifest && clientReferenceManifest) {
    setReferenceManifestsSingleton({
      page,
      clientReferenceManifest,
      serverActionsManifest,
      serverModuleMap: createServerModuleMap({
        serverActionsManifest,
      }),
    })
  }

  const ComponentMod = await requirePage(page, distDir, isAppPath)

  const Component = interopDefault(ComponentMod)
  const Document = interopDefault(DocumentMod)
  const App = interopDefault(AppMod)

  const { getServerSideProps, getStaticProps, getStaticPaths, routeModule } =
    ComponentMod

  return {
    App,
    Document,
    Component,
    buildManifest,
    subresourceIntegrityManifest,
    reactLoadableManifest: reactLoadableManifest || {},
    dynamicCssManifest,
    pageConfig: ComponentMod.config || {},
    ComponentMod,
    getServerSideProps,
    getStaticProps,
    getStaticPaths,
    clientReferenceManifest,
    serverActionsManifest,
    isAppPath,
    page,
    routeModule,
  }
}

export const loadComponents = getTracer().wrap(
  LoadComponentsSpan.loadComponents,
  loadComponentsImpl
)
