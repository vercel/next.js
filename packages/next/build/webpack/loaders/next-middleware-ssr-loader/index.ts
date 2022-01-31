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
    self.__current_route = ${JSON.stringify(page)}
    self.__server_context = {
      Component: pageMod.default,
      pageConfig: pageMod.config || {},
      buildManifest,
      reactLoadableManifest,
      Document,
      App,
      getStaticProps: pageMod.getStaticProps,
      getServerSideProps: pageMod.getServerSideProps,
      getStaticPaths: pageMod.getStaticPaths,
      ComponentMod: undefined,
      serverComponentManifest: ${isServerComponent} ? rscManifest : null,

      // components
      errorMod,
      error500Mod,

      // renderOpts
      buildId: ${JSON.stringify(buildId)},
      dev: ${dev},
      env: process.env,
      supportsDynamicHTML: true,
      concurrentFeatures: true,
      disableOptimizedLoading: true,
    }
  
    const render = getRender({
      Document,
      isServerComponent: ${isServerComponent},
      config: ${stringifiedConfig},
    })

    export default function rscMiddleware(opts) {
      return adapter({
        ...opts,
        handler: render
      })
    }`

  return transformed
}
