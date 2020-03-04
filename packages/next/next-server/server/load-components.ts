import {
  BUILD_MANIFEST,
  CLIENT_STATIC_FILES_PATH,
  REACT_LOADABLE_MANIFEST,
  SERVER_DIRECTORY,
} from '../lib/constants'
import { join } from 'path'
import { requirePage } from './require'
import { BuildManifest } from './get-page-files'
import { AppType, DocumentType } from '../lib/utils'
import {
  PageConfig,
  NextPageContext,
  GetStaticPaths,
  GetServerSideProps,
  GetStaticProps,
} from 'next/types'

const webpack5Experiential = parseInt(require('webpack').version) === 5

export function interopDefault(mod: any) {
  return mod.default || mod
}

export type ManifestItem = {
  id: number | string
  name: string
  file: string
  publicPath: string
}

type ReactLoadableManifest = { [moduleId: string]: ManifestItem[] }

export type LoadComponentsReturnType = {
  Component: React.ComponentType
  pageConfig?: PageConfig
  buildManifest: BuildManifest
  reactLoadableManifest: ReactLoadableManifest
  Document: DocumentType
  DocumentMiddleware?: (ctx: NextPageContext) => void
  App: AppType
  getStaticProps?: GetStaticProps
  getStaticPaths?: GetStaticPaths
  getServerSideProps?: GetServerSideProps
}

// might be a hack, but on-demand-entries-handler would not require updated versions of manifest files.
// used for webpack 5
// function require(module) {
//   delete require.cache[require.resolve(module)]
//   return require(module)
// }

export async function loadComponents(
  distDir: string,
  buildId: string,
  pathname: string,
  serverless: boolean
): Promise<LoadComponentsReturnType> {
  if (serverless) {
    const Component = await requirePage(pathname, distDir, serverless)
    const { getStaticProps, getStaticPaths, getServerSideProps } = Component

    return {
      Component,
      pageConfig: Component.config || {},
      getStaticProps,
      getStaticPaths,
      getServerSideProps,
    } as LoadComponentsReturnType
  }
  const documentPath = join(
    distDir,
    SERVER_DIRECTORY,
    CLIENT_STATIC_FILES_PATH,
    buildId,
    'pages',
    '_document'
  )
  const appPath = join(
    distDir,
    SERVER_DIRECTORY,
    CLIENT_STATIC_FILES_PATH,
    buildId,
    'pages',
    '_app'
  )

  // bust require cache on hmr
  const DocumentMod = webpack5Experiential
    ? require(documentPath)
    : require(documentPath)
  const { middleware: DocumentMiddleware } = DocumentMod

  // bust require cache on hmr
  const AppMod = webpack5Experiential ? require(appPath) : require(appPath)

  const ComponentMod = requirePage(pathname, distDir, serverless)

  const [
    buildManifest,
    reactLoadableManifest,
    Component,
    Document,
    App,
  ] = await Promise.all([
    // bust require cache on hmr
    webpack5Experiential
      ? require(join(distDir, BUILD_MANIFEST))
      : require(join(distDir, BUILD_MANIFEST)),
    webpack5Experiential
      ? require(join(distDir, REACT_LOADABLE_MANIFEST))
      : require(join(distDir, REACT_LOADABLE_MANIFEST)),
    interopDefault(ComponentMod),
    interopDefault(DocumentMod),
    interopDefault(AppMod),
  ])

  const { getServerSideProps, getStaticProps, getStaticPaths } = ComponentMod

  return {
    App,
    Document,
    Component,
    buildManifest,
    DocumentMiddleware,
    reactLoadableManifest,
    pageConfig: ComponentMod.config || {},
    getServerSideProps,
    getStaticProps,
    getStaticPaths,
  }
}
