import type {
  AppType,
  DocumentType,
  NextComponentType,
} from '../shared/lib/utils'
import type {
  PageConfig,
  GetStaticPaths,
  GetServerSideProps,
  GetStaticProps,
} from 'next/types'
import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  FLIGHT_MANIFEST,
  NEXT_CLIENT_SSR_ENTRY_SUFFIX,
} from '../shared/lib/constants'
import { join } from 'path'
import { requirePage, getPagePath } from './require'
import { BuildManifest } from './get-page-files'
import { interopDefault } from '../lib/interop-default'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'

export type ManifestItem = {
  id: number | string
  files: string[]
}

export type ReactLoadableManifest = { [moduleId: string]: ManifestItem }

export type LoadComponentsReturnType = {
  Component: NextComponentType
  pageConfig: PageConfig
  buildManifest: BuildManifest
  reactLoadableManifest: ReactLoadableManifest
  serverComponentManifest?: any
  Document: DocumentType
  App: AppType
  getStaticProps?: GetStaticProps
  getStaticPaths?: GetStaticPaths
  getServerSideProps?: GetServerSideProps
  ComponentMod: any
  isAppPath?: boolean
}

export async function loadDefaultErrorComponents(distDir: string) {
  const Document = interopDefault(require('next/dist/pages/_document'))
  const AppMod = require('next/dist/pages/_app')
  const App = interopDefault(AppMod)
  const ComponentMod = require('next/dist/pages/_error')
  const Component = interopDefault(ComponentMod)

  return {
    App,
    Document,
    Component,
    pageConfig: {},
    buildManifest: require(join(distDir, `fallback-${BUILD_MANIFEST}`)),
    reactLoadableManifest: {},
    ComponentMod,
  }
}

export async function loadComponents(
  distDir: string,
  pathname: string,
  serverless: boolean,
  hasServerComponents?: boolean,
  appDirEnabled?: boolean
): Promise<LoadComponentsReturnType> {
  if (serverless) {
    const ComponentMod = await requirePage(pathname, distDir, serverless)
    if (typeof ComponentMod === 'string') {
      return {
        Component: ComponentMod as any,
        pageConfig: {},
        ComponentMod,
      } as LoadComponentsReturnType
    }

    let {
      default: Component,
      getStaticProps,
      getStaticPaths,
      getServerSideProps,
    } = ComponentMod

    Component = await Component
    getStaticProps = await getStaticProps
    getStaticPaths = await getStaticPaths
    getServerSideProps = await getServerSideProps
    const pageConfig = (await ComponentMod.config) || {}

    return {
      Component,
      pageConfig,
      getStaticProps,
      getStaticPaths,
      getServerSideProps,
      ComponentMod,
    } as LoadComponentsReturnType
  }

  const [DocumentMod, AppMod, ComponentMod] = await Promise.all([
    Promise.resolve().then(() =>
      requirePage('/_document', distDir, serverless, appDirEnabled)
    ),
    Promise.resolve().then(() =>
      requirePage('/_app', distDir, serverless, appDirEnabled)
    ),
    Promise.resolve().then(() =>
      requirePage(pathname, distDir, serverless, appDirEnabled)
    ),
  ])

  const [buildManifest, reactLoadableManifest, serverComponentManifest] =
    await Promise.all([
      require(join(distDir, BUILD_MANIFEST)),
      require(join(distDir, REACT_LOADABLE_MANIFEST)),
      hasServerComponents
        ? require(join(distDir, 'server', FLIGHT_MANIFEST + '.json'))
        : null,
    ])

  if (hasServerComponents) {
    try {
      // Make sure to also load the client entry in cache.
      await requirePage(
        normalizePagePath(pathname) + NEXT_CLIENT_SSR_ENTRY_SUFFIX,
        distDir,
        serverless,
        appDirEnabled
      )
    } catch (_) {
      // This page might not be a server component page, so there is no
      // client entry to load.
    }
  }

  const Component = interopDefault(ComponentMod)
  const Document = interopDefault(DocumentMod)
  const App = interopDefault(AppMod)

  const { getServerSideProps, getStaticProps, getStaticPaths } = ComponentMod

  let isAppPath = false

  if (appDirEnabled) {
    const pagePath = getPagePath(
      pathname,
      distDir,
      serverless,
      false,
      undefined,
      appDirEnabled
    )
    isAppPath = !!pagePath?.match(/server[/\\]app[/\\]/)
  }

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
    serverComponentManifest,
    isAppPath,
  }
}
