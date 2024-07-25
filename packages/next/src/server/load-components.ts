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
  UNDERSCORE_NOT_FOUND_ROUTE,
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

export type ManifestItem = {
  id: number | string
  files: string[]
}

export type ReactLoadableManifest = { [moduleId: string]: ManifestItem }

/**
 * A manifest entry type for the react-loadable-manifest.json.
 *
 * The whole manifest.json is a type of `Record<pathName, LoadableManifest>`
 * where pathName is a string-based key points to the path of the page contains
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

async function loadClientReferenceManifest(
  manifestPath: string,
  entryName: string
) {
  try {
    const context = await evalManifestWithRetries<{
      __RSC_MANIFEST: { [key: string]: ClientReferenceManifest }
    }>(manifestPath)
    return context.__RSC_MANIFEST[entryName]
  } catch (err) {
    return undefined
  }
}

async function loadComponentsImpl<N = any>({
  distDir,
  page,
  isAppPath,
}: {
  distDir: string
  page: string
  isAppPath: boolean
}): Promise<LoadComponentsReturnType<N>> {
  let DocumentMod: DocumentType = {} as any
  let AppMod: AppType = {} as any
  if (!isAppPath) {
    ;[DocumentMod, AppMod] = await Promise.all([
      requirePage('/_document', distDir, false),
      requirePage('/_app', distDir, false),
    ])
  }

  // Make sure to avoid loading the manifest for Route Handlers
  const hasClientManifest =
    isAppPath && (page.endsWith('/page') || page === UNDERSCORE_NOT_FOUND_ROUTE)

  // Load the manifest files first
  const [
    buildManifest,
    reactLoadableManifest,
    clientReferenceManifest,
    serverActionsManifest,
  ] = await Promise.all([
    loadManifestWithRetries<BuildManifest>(join(distDir, BUILD_MANIFEST)),
    loadManifestWithRetries<ReactLoadableManifest>(
      join(distDir, REACT_LOADABLE_MANIFEST)
    ),
    hasClientManifest
      ? loadClientReferenceManifest(
          join(
            distDir,
            'server',
            'app',
            page.replace(/%5F/g, '_') + '_' + CLIENT_REFERENCE_MANIFEST + '.js'
          ),
          page.replace(/%5F/g, '_')
        )
      : undefined,
    isAppPath
      ? loadManifestWithRetries<ActionManifest>(
          join(distDir, 'server', SERVER_REFERENCE_MANIFEST + '.json')
        ).catch(() => null)
      : null,
  ])

  // Before requring the actual page module, we have to set the reference manifests
  // to our global store so Server Action's encryption util can access to them
  // at the top level of the page module.
  if (serverActionsManifest && clientReferenceManifest) {
    setReferenceManifestsSingleton({
      clientReferenceManifest,
      serverActionsManifest,
      serverModuleMap: createServerModuleMap({
        serverActionsManifest,
        pageName: page,
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
    reactLoadableManifest,
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
