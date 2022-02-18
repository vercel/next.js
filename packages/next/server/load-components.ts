import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
} from '../shared/lib/constants'
import { join } from 'path'
import { requirePage } from './require'
import { BuildManifest } from './get-page-files'
import { AppType, DocumentType } from '../shared/lib/utils'
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
  Component: React.ComponentType
  pageConfig: PageConfig
  buildManifest: BuildManifest
  reactLoadableManifest: ReactLoadableManifest
  Document: DocumentType
  App: AppType
  getStaticProps?: GetStaticProps
  getStaticPaths?: GetStaticPaths
  getServerSideProps?: GetServerSideProps
  ComponentMod: any
}

export async function loadDefaultErrorComponents(
  distDir: string,
  { hasConcurrentFeatures }: { hasConcurrentFeatures: boolean }
) {
  const Document = interopDefault(
    require(`next/dist/pages/_document` +
      (hasConcurrentFeatures ? '-concurrent' : ''))
  )
  const App = interopDefault(require('next/dist/pages/_app'))
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
  pathname: string
): Promise<LoadComponentsReturnType> {
  const [DocumentMod, AppMod, ComponentMod] = await Promise.all([
    requirePage('/_document', distDir),
    requirePage('/_app', distDir),
    requirePage(pathname, distDir),
  ])

  const [buildManifest, reactLoadableManifest] = await Promise.all([
    require(join(distDir, BUILD_MANIFEST)),
    require(join(distDir, REACT_LOADABLE_MANIFEST)),
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
  }
}
