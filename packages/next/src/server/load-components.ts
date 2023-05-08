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
import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  CLIENT_REFERENCE_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
} from '../shared/lib/constants'
import { join } from 'path'
import { requirePage } from './require'
import { BuildManifest } from './get-page-files'
import { interopDefault } from '../lib/interop-default'
import { getTracer } from './lib/trace/tracer'
import { LoadComponentsSpan } from './lib/trace/constants'

export type ManifestItem = {
  id: number | string
  files: string[]
}

export type ReactLoadableManifest = { [moduleId: string]: ManifestItem }

export type LoadComponentsReturnType = {
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
  ComponentMod: any
  isAppPath?: boolean
  pathname: string
}

/**
 * Load manifest file with retries, defaults to 3 attempts.
 */
async function loadManifest<T>(manifestPath: string, attempts = 3): Promise<T> {
  while (true) {
    try {
      return require(manifestPath)
    } catch (err) {
      attempts--
      if (attempts <= 0) throw err
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}

async function loadDefaultErrorComponentsImpl(distDir: string) {
  // Load the compiled route module for this builtin error.
  // TODO: (wyattjoh) replace this with just exporting the route module when the transition is complete
  const ComponentMod = require('./future/route-modules/pages/builtin/_error')

  return {
    App: ComponentMod.routeModule.application.components.App,
    Document: ComponentMod.routeModule.application.components.Document,
    Component: ComponentMod.routeModule.userland.default,
    ComponentMod,
    pageConfig: {},
    buildManifest: await loadManifest<BuildManifest>(
      join(distDir, BUILD_MANIFEST)
    ),
    reactLoadableManifest: {},
    pathname: '/_error',
  }
}

async function loadComponentsImpl({
  distDir,
  pathname,
  hasServerComponents,
  isAppPath,
}: {
  distDir: string
  pathname: string
  hasServerComponents: boolean
  isAppPath: boolean
}): Promise<LoadComponentsReturnType> {
  let DocumentMod = {}
  let AppMod = {}
  if (!isAppPath) {
    ;[DocumentMod, AppMod] = await Promise.all([
      Promise.resolve().then(() => requirePage('/_document', distDir, false)),
      Promise.resolve().then(() => requirePage('/_app', distDir, false)),
    ])
  }
  const ComponentMod = await Promise.resolve().then(() =>
    requirePage(pathname, distDir, isAppPath)
  )

  const [
    buildManifest,
    reactLoadableManifest,
    clientReferenceManifest,
    serverActionsManifest,
  ] = await Promise.all([
    loadManifest<BuildManifest>(join(distDir, BUILD_MANIFEST)),
    loadManifest<ReactLoadableManifest>(join(distDir, REACT_LOADABLE_MANIFEST)),
    hasServerComponents
      ? loadManifest<ClientReferenceManifest>(
          join(distDir, 'server', CLIENT_REFERENCE_MANIFEST + '.json')
        )
      : undefined,
    hasServerComponents
      ? loadManifest(
          join(distDir, 'server', SERVER_REFERENCE_MANIFEST + '.json')
        ).catch(() => null)
      : null,
  ])

  const isRouteModule =
    typeof ComponentMod === 'object' &&
    'routeModule' in ComponentMod &&
    typeof ComponentMod.routeModule !== 'undefined'

  const Component = isRouteModule
    ? ComponentMod.routeModule.default
    : interopDefault(ComponentMod)
  const Document = isRouteModule
    ? ComponentMod.routeModule.components?.Document
    : interopDefault(DocumentMod)
  const App = isRouteModule
    ? ComponentMod.routeModule.components?.App
    : interopDefault(AppMod)

  const { getServerSideProps, getStaticProps, getStaticPaths } = isRouteModule
    ? ComponentMod.routeModule.userland
    : ComponentMod

  return {
    App,
    Document,
    Component,
    buildManifest,
    reactLoadableManifest,
    pageConfig:
      (isRouteModule
        ? ComponentMod.routeModule.userland.config
        : ComponentMod.config) || {},
    ComponentMod,
    getServerSideProps,
    getStaticProps,
    getStaticPaths,
    clientReferenceManifest,
    serverActionsManifest,
    isAppPath,
    pathname,
  }
}

export const loadComponents = getTracer().wrap(
  LoadComponentsSpan.loadComponents,
  loadComponentsImpl
)

export const loadDefaultErrorComponents = getTracer().wrap(
  LoadComponentsSpan.loadDefaultErrorComponents,
  loadDefaultErrorComponentsImpl
)
