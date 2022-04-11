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
import { getPagePath, requirePage } from './require'
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
  isRootPath?: boolean
  rootLayouts?: Array<{
    isRoot?: boolean
    Component: NextComponentType
    getStaticProps?: GetStaticProps
    getServerSideProps?: GetServerSideProps
  }>
  AppServerMod: any
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
  rootDirEnabled?: boolean,
  serverComponents?: boolean
): Promise<LoadComponentsReturnType> {
  const [DocumentMod, AppMod, ComponentMod, AppServerMod] = await Promise.all([
    requirePage('/_document', distDir, rootDirEnabled),
    requirePage('/_app', distDir, rootDirEnabled),
    requirePage(pathname, distDir, rootDirEnabled),
    serverComponents
      ? requirePage('/_app.server', distDir, rootDirEnabled)
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
  let isRootPath = false

  if (rootDirEnabled) {
    const pagePath = getPagePath(pathname, distDir, undefined, rootDirEnabled)
    isRootPath = !!pagePath?.match(/server[/\\]root[/\\]/)
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
    isRootPath,
    serverComponentManifest,
  }
}
