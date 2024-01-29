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
} from 'next/types'
import type { RouteModule } from './future/route-modules/route-module'
import type { BuildManifest } from './get-page-files'

import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  CLIENT_REFERENCE_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
} from '../shared/lib/constants'
import { join } from 'path'
import { requirePage } from './require'
import { interopDefault } from '../lib/interop-default'
import { getTracer } from './lib/trace/tracer'
import { LoadComponentsSpan } from './lib/trace/constants'
import { evalManifest, loadManifest } from './load-manifest'
import { wait } from '../lib/wait'
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
  buildManifest: BuildManifest
  subresourceIntegrityManifest?: Record<string, string>
  reactLoadableManifest: ReactLoadableManifest
  clientReferenceManifest?: ClientReferenceManifest
  serverActionsManifest?: any
  Document: DocumentType
  App: AppType
  getStaticProps?: GetStaticProps
  getStaticPaths?: GetStaticPaths
  getServerSideProps?: GetServerSideProps
  ComponentMod: NextModule
  routeModule?: RouteModule
  isAppPath?: boolean
  page: string
}

/**
 * Load manifest file with retries, defaults to 3 attempts.
 */
export async function loadManifestWithRetries(
  manifestPath: string,
  attempts = 3
): Promise<unknown> {
  while (true) {
    try {
      return loadManifest(manifestPath)
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
export async function evalManifestWithRetries(
  manifestPath: string,
  attempts = 3
): Promise<unknown> {
  while (true) {
    try {
      return evalManifest(manifestPath)
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
): Promise<ClientReferenceManifest | undefined> {
  try {
    const context = (await evalManifestWithRetries(manifestPath)) as {
      __RSC_MANIFEST: { [key: string]: ClientReferenceManifest }
    }
    return context.__RSC_MANIFEST[entryName] as ClientReferenceManifest
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
  let DocumentMod = {}
  let AppMod = {}
  if (!isAppPath) {
    ;[DocumentMod, AppMod] = await Promise.all([
      Promise.resolve().then(() => requirePage('/_document', distDir, false)),
      Promise.resolve().then(() => requirePage('/_app', distDir, false)),
    ])
  }
  const ComponentMod = await Promise.resolve().then(() =>
    requirePage(page, distDir, isAppPath)
  )

  // Make sure to avoid loading the manifest for Route Handlers
  const hasClientManifest =
    isAppPath &&
    (page.endsWith('/page') || page === '/not-found' || page === '/_not-found')

  const [
    buildManifest,
    reactLoadableManifest,
    clientReferenceManifest,
    serverActionsManifest,
  ] = await Promise.all([
    loadManifestWithRetries(
      join(distDir, BUILD_MANIFEST)
    ) as Promise<BuildManifest>,
    loadManifestWithRetries(
      join(distDir, REACT_LOADABLE_MANIFEST)
    ) as Promise<ReactLoadableManifest>,
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
      ? loadManifestWithRetries(
          join(distDir, 'server', SERVER_REFERENCE_MANIFEST + '.json')
        ).catch(() => null)
      : null,
  ])

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
