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
} from '../shared/lib/constants'
import { join } from 'path'
import { requirePage } from './require'
import { BuildManifest } from './get-page-files'
import { interopDefault } from '../lib/interop-default'

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
  serverComponentManifest?: any
  Document: DocumentType
  App: AppType
  getStaticProps?: GetStaticProps
  getStaticPaths?: GetStaticPaths
  getServerSideProps?: GetServerSideProps
  ComponentMod: any
  isAppPath?: boolean
  pathname: string
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
    pathname: '/_error',
  }
}

export async function loadComponents({
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

  const [buildManifest, reactLoadableManifest, serverComponentManifest] =
    await Promise.all([
      require(join(distDir, BUILD_MANIFEST)),
      require(join(distDir, REACT_LOADABLE_MANIFEST)),
      hasServerComponents
        ? require(join(distDir, 'server', FLIGHT_MANIFEST + '.json'))
        : null,
    ])

  const Component = interopDefault(ComponentMod)
  const Document = interopDefault(DocumentMod)
  const App = interopDefault(AppMod)

  const { getServerSideProps, getStaticProps, getStaticPaths } = ComponentMod

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
    pathname,
  }
}
