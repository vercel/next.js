import { getModuleBuildInfo } from '../get-module-build-info'
import { stringifyRequest } from '../../stringify-request'

export type EdgeSSRLoaderQuery = {
  absolute500Path: string
  absoluteAppPath: string
  absoluteDocumentPath: string
  absoluteErrorPath: string
  absolutePagePath: string
  buildId: string
  dev: boolean
  isServerComponent: boolean
  page: string
  stringifiedConfig: string
  appDirLoader?: string
  pagesType: 'app' | 'pages' | 'root'
  sriEnabled: boolean
  hasFontLoaders: boolean
}

/*
For pages SSR'd at the edge, we bundle them with the ESM version of Next in order to
benefit from the better tree-shaking and thus, smaller bundle sizes.

The absolute paths for _app, _error and _document, used in this loader, link to the regular CJS modules.
They are generated in `createPagesMapping` where we don't have access to `isEdgeRuntime`,
so we have to do it here. It's not that bad because it keeps all references to ESM modules magic in this place.
*/
function swapDistFolderWithEsmDistFolder(path: string) {
  return path.replace('next/dist/pages', 'next/dist/esm/pages')
}

export default async function edgeSSRLoader(this: any) {
  const {
    dev,
    page,
    buildId,
    absolutePagePath,
    absoluteAppPath,
    absoluteDocumentPath,
    absolute500Path,
    absoluteErrorPath,
    isServerComponent,
    stringifiedConfig,
    appDirLoader: appDirLoaderBase64,
    pagesType,
    sriEnabled,
    hasFontLoaders,
  } = this.getOptions()

  const appDirLoader = Buffer.from(
    appDirLoaderBase64 || '',
    'base64'
  ).toString()
  const isAppDir = pagesType === 'app'

  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.nextEdgeSSR = {
    isServerComponent: isServerComponent === 'true',
    page: page,
    isAppDir,
  }
  buildInfo.route = {
    page,
    absolutePagePath,
  }

  const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
  const stringifiedAppPath = stringifyRequest(
    this,
    swapDistFolderWithEsmDistFolder(absoluteAppPath)
  )
  const stringifiedErrorPath = stringifyRequest(
    this,
    swapDistFolderWithEsmDistFolder(absoluteErrorPath)
  )
  const stringifiedDocumentPath = stringifyRequest(
    this,
    swapDistFolderWithEsmDistFolder(absoluteDocumentPath)
  )
  const stringified500Path = absolute500Path
    ? stringifyRequest(this, absolute500Path)
    : null

  const pageModPath = `${appDirLoader}${stringifiedPagePath.substring(
    1,
    stringifiedPagePath.length - 1
  )}${isAppDir ? '?__edge_ssr_entry__' : ''}`

  const transformed = `
    import { adapter, enhanceGlobals } from 'next/dist/esm/server/web/adapter'
    import { getRender } from 'next/dist/esm/build/webpack/loaders/next-edge-ssr-loader/render'

    enhanceGlobals()

    const pageType = ${JSON.stringify(pagesType)}
    ${
      isAppDir
        ? `
      const Document = null
      const appRenderToHTML = require('next/dist/esm/server/app-render').renderToHTMLOrFlight
      const pagesRenderToHTML = null
      const pageMod = require(${JSON.stringify(pageModPath)})
      const appMod = null
      const errorMod = null
      const error500Mod = null
    `
        : `
      const Document = require(${stringifiedDocumentPath}).default
      const appRenderToHTML = null
      const pagesRenderToHTML = require('next/dist/esm/server/render').renderToHTML
      const pageMod = require(${stringifiedPagePath})
      const appMod = require(${stringifiedAppPath})
      const errorMod = require(${stringifiedErrorPath})
      const error500Mod = ${
        stringified500Path ? `require(${stringified500Path})` : 'null'
      }
    `
    }


    const buildManifest = self.__BUILD_MANIFEST
    const reactLoadableManifest = self.__REACT_LOADABLE_MANIFEST
    const rscManifest = self.__RSC_MANIFEST
    const rscCssManifest = self.__RSC_CSS_MANIFEST
    const subresourceIntegrityManifest = ${
      sriEnabled ? 'self.__SUBRESOURCE_INTEGRITY_MANIFEST' : 'undefined'
    }
    const fontLoaderManifest = ${
      hasFontLoaders ? 'self.__FONT_LOADER_MANIFEST' : 'undefined'
    }

    const render = getRender({
      pageType,
      dev: ${dev},
      page: ${JSON.stringify(page)},
      appMod,
      pageMod,
      errorMod,
      error500Mod,
      Document,
      buildManifest,
      appRenderToHTML,
      pagesRenderToHTML,
      reactLoadableManifest,
      serverComponentManifest: ${isServerComponent} ? rscManifest : null,
      serverCSSManifest: ${isServerComponent} ? rscCssManifest : null,
      subresourceIntegrityManifest,
      config: ${stringifiedConfig},
      buildId: ${JSON.stringify(buildId)},
      fontLoaderManifest,
    })

    export const ComponentMod = pageMod

    export default function(opts) {
      return adapter({
        ...opts,
        handler: render
      })
    }`

  return transformed
}
