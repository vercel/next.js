import type {
  AppType,
  DocumentType,
  NextComponentType,
} from '../shared/lib/utils'
import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  MIDDLEWARE_FLIGHT_MANIFEST,
} from '../shared/lib/constants'
import { join } from 'path'
import { requirePage, getPagePath } from './require'
import { BuildManifest } from './get-page-files'
import { interopDefault } from '../lib/interop-default'
import {
  PageConfig,
  GetStaticPaths,
  GetServerSideProps,
  GetStaticProps,
} from 'next/types'

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
  AppMod: any
  AppServerMod: any
  isViewPath?: boolean
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
    AppMod,
    // Use App for fallback
    AppServerMod: AppMod,
  }
}

export async function loadComponents(
  distDir: string,
  pathname: string,
  serverless: boolean,
  serverComponents?: boolean,
  rootEnabled?: boolean
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

  const [DocumentMod, AppMod, ComponentMod, AppServerMod] = await Promise.all([
    Promise.resolve().then(() =>
      requirePage('/_document', distDir, serverless, rootEnabled)
    ),
    Promise.resolve().then(() =>
      requirePage('/_app', distDir, serverless, rootEnabled)
    ),
    Promise.resolve().then(() =>
      requirePage(pathname, distDir, serverless, rootEnabled)
    ),
    serverComponents
      ? Promise.resolve().then(() =>
          requirePage('/_app.server', distDir, serverless, rootEnabled)
        )
      : null,
  ])

  const [buildManifest, reactLoadableManifest, serverComponentManifest] =
    await Promise.all([
      require(join(distDir, BUILD_MANIFEST)),
      require(join(distDir, REACT_LOADABLE_MANIFEST)),
      serverComponents
        ? require(join(distDir, 'server', MIDDLEWARE_FLIGHT_MANIFEST + '.json'))
        : null,
    ])

  const Component = interopDefault(ComponentMod)
  const Document = interopDefault(DocumentMod)
  const App = interopDefault(AppMod)

  const { getServerSideProps, getStaticProps, getStaticPaths } = ComponentMod

  let isViewPath = false

  if (rootEnabled) {
    const pagePath = getPagePath(
      pathname,
      distDir,
      serverless,
      false,
      undefined,
      rootEnabled
    )
    isViewPath = !!pagePath?.match(/server[/\\]views[/\\]/)
  }

  return {
    App,
    Document,
    Component,
    buildManifest,
    reactLoadableManifest,
    pageConfig: ComponentMod.config || {},
    ComponentMod,
    AppMod,
    AppServerMod,
    getServerSideProps,
    getStaticProps,
    getStaticPaths,
    serverComponentManifest,
    isViewPath,
  }
}
