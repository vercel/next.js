import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
} from '../shared/lib/constants'
import { join } from 'path'
import { requirePage } from './require'
import { BuildManifest } from './get-page-files'
import { AppType, DocumentType } from '../shared/lib/utils'
import {
  PageConfig,
  GetStaticPaths,
  GetServerSideProps,
  GetStaticProps,
} from 'next/types'

export function interopDefault(mod: any) {
  return mod.default || mod
}

export type ManifestItem = {
  id: number | string
  files: string[]
}

type ReactLoadableManifest = { [moduleId: string]: ManifestItem }

export type LoadComponentsReturnType = {
  Component: React.ComponentType
  pageConfig: PageConfig
  buildManifest: BuildManifest
  reactLoadableManifest: ReactLoadableManifest
  // @Q LayoutType
  Layout: React.ComponentType
  Document: DocumentType
  App: AppType
  getStaticLayoutProps?: GetStaticProps
  getStaticProps?: GetStaticProps
  getStaticPaths?: GetStaticPaths
  getServerSideProps?: GetServerSideProps
  ComponentMod: any
}

export async function loadDefaultErrorComponents(distDir: string) {
  const Document = interopDefault(require('next/dist/pages/_document'))
  const App = interopDefault(require('next/dist/pages/_app'))
  const Layout = interopDefault(require('next/dist/pages/_layout'))
  const ComponentMod = require('next/dist/pages/_error')
  const Component = interopDefault(ComponentMod)

  return {
    App,
    Document,
    Layout,
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
  serverless: boolean
): Promise<LoadComponentsReturnType> {
  // @Q Called during build & runtime!
  // @Q Where we are actually running getStaticProps!

  // @Q Serverless is only on vercel - seems to only be HTML in serverless too...
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

  const DocumentMod = await requirePage('/_document', distDir, serverless)
  const AppMod = await requirePage('/_app', distDir, serverless)
  const LayoutMod = await requirePage('/_layout', distDir, serverless)
  const ComponentMod = await requirePage(pathname, distDir, serverless)

  // @Q This just loads the default export
  const [
    buildManifest,
    reactLoadableManifest,
    Component,
    Document,
    App,
    Layout,
  ] = await Promise.all([
    require(join(distDir, BUILD_MANIFEST)),
    require(join(distDir, REACT_LOADABLE_MANIFEST)),
    interopDefault(ComponentMod),
    interopDefault(DocumentMod),
    interopDefault(AppMod),
    interopDefault(LayoutMod),
  ])

  const { getServerSideProps, getStaticProps, getStaticPaths } = ComponentMod
  const { getStaticLayoutProps } = LayoutMod

  return {
    App,
    Document,
    Layout,
    Component,
    buildManifest,
    reactLoadableManifest,
    pageConfig: ComponentMod.config || {},
    ComponentMod,
    getStaticLayoutProps,
    getServerSideProps,
    getStaticProps,
    getStaticPaths,
  }
}
