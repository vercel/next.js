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
  } = this.getOptions()

  const buildInfo = getModuleBuildInfo(this._module)
  buildInfo.nextEdgeSSR = {
    isServerComponent: isServerComponent === 'true',
    page: page,
  }
  buildInfo.route = {
    page,
    absolutePagePath,
  }

  const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
  const stringifiedAppPath = stringifyRequest(this, absoluteAppPath)
  const stringifiedErrorPath = stringifyRequest(this, absoluteErrorPath)
  const stringifiedDocumentPath = stringifyRequest(this, absoluteDocumentPath)
  const stringified500Path = absolute500Path
    ? stringifyRequest(this, absolute500Path)
    : null

  const transformed = `
    import { adapter } from 'next/dist/server/web/adapter'
    import { getRender } from 'next/dist/build/webpack/loaders/next-edge-ssr-loader/render'

    import Document from ${stringifiedDocumentPath}

    const appMod = require(${stringifiedAppPath})
    const pageMod = require(${stringifiedPagePath})
    const errorMod = require(${stringifiedErrorPath})
    const error500Mod = ${
      stringified500Path ? `require(${stringified500Path})` : 'null'
    }

    const buildManifest = self.__BUILD_MANIFEST
    const reactLoadableManifest = self.__REACT_LOADABLE_MANIFEST
    const rscManifest = self.__RSC_MANIFEST

    const render = getRender({
      dev: ${dev},
      page: ${JSON.stringify(page)},
      appMod,
      pageMod,
      errorMod,
      error500Mod,
      Document,
      buildManifest,
      reactLoadableManifest,
      serverComponentManifest: ${isServerComponent} ? rscManifest : null,
      config: ${stringifiedConfig},
      buildId: ${JSON.stringify(buildId)},
    })

    export default function(opts) {
      return adapter({
        ...opts,
        handler: render
      })
    }`

  return transformed
}
