import { stringifyRequest } from '../../stringify-request'

export default async function middlewareSSRLoader(this: any) {
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

  const stringifiedPagePath = stringifyRequest(this, absolutePagePath)
  const stringifiedAppPath = stringifyRequest(this, absoluteAppPath)
  const stringifiedErrorPath = stringifyRequest(this, absoluteErrorPath)
  const stringifiedDocumentPath = stringifyRequest(this, absoluteDocumentPath)
  const stringified500Path = absolute500Path
    ? stringifyRequest(this, absolute500Path)
    : 'null'

  const transformed = `
    import { adapter } from 'next/dist/server/web/adapter'
    import { RouterContext } from 'next/dist/shared/lib/router-context'

    import { getRender } from 'next/dist/build/webpack/loaders/next-middleware-ssr-loader/render'

    import App from ${stringifiedAppPath}
    import Document from ${stringifiedDocumentPath}

    const pageMod = require(${stringifiedPagePath})
    const errorMod = require(${stringifiedErrorPath})
    const error500Mod = ${stringified500Path} ? require(${stringified500Path}) : null

    const buildManifest = self.__BUILD_MANIFEST
    const reactLoadableManifest = self.__REACT_LOADABLE_MANIFEST
    const rscManifest = self.__RSC_MANIFEST

    if (typeof pageMod.default !== 'function') {
      throw new Error('Your page must export a \`default\` component')
    }

    // Set server context
    self.__server_context = {
      page: ${JSON.stringify(page)},
      buildId: ${JSON.stringify(buildId)},
    }
  
    const render = getRender({
      dev: ${dev},
      page: ${JSON.stringify(page)},
      pageMod,
      errorMod,
      error500Mod,
      App,
      Document,
      buildManifest,
      reactLoadableManifest,
      serverComponentManifest: ${isServerComponent} ? rscManifest : null,
      isServerComponent: ${isServerComponent},
      config: ${stringifiedConfig},
      buildId: ${JSON.stringify(buildId)},
    })

    export default function rscMiddleware(opts) {
      return adapter({
        ...opts,
        handler: render
      })
    }`

  return transformed
}
