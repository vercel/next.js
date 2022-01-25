import { stringifyRequest } from '../../stringify-request'

export default async function middlewareSSRLoader(this: any) {
  const {
    dev,
    page,
    absolutePagePath,
    absoluteAppPath,
    absoluteDocumentPath,
    absolute500Path,
    absoluteErrorPath,
    isServerComponent,
    stringifiedConfig,
    ...restRenderOpts
  } = this.getOptions()

  const stringifiedAbsolutePagePath = stringifyRequest(this, absolutePagePath)
  const stringifiedAbsoluteAppPath = stringifyRequest(this, absoluteAppPath)
  const stringifiedAbsolute500PagePath = stringifyRequest(
    this,
    absolute500Path || absoluteErrorPath
  )
  const stringifiedAbsoluteDocumentPath = stringifyRequest(
    this,
    absoluteDocumentPath
  )

  const transformed = `
    import { adapter } from 'next/dist/server/web/adapter'
    import { RouterContext } from 'next/dist/shared/lib/router-context'

    import App from ${stringifiedAbsoluteAppPath}
    import Document from ${stringifiedAbsoluteDocumentPath}

    import { getRender } from 'next/dist/build/webpack/loaders/next-middleware-ssr-loader/render'

    const pageMod = require(${stringifiedAbsolutePagePath})
    const errorMod = require(${stringifiedAbsolute500PagePath})

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

      // components
      errorMod,

      // renderOpts
      dev: ${JSON.stringify(dev)},
      env: process.env,
      supportsDynamicHTML: true,
      concurrentFeatures: true,
      disableOptimizedLoading: true,
    }
  
    const render = getRender({
      App,
      Document,
      pageMod,
      errorMod,
      buildManifest,
      reactLoadableManifest,
      rscManifest,
      isServerComponent: ${isServerComponent},
      config: ${stringifiedConfig},
      restRenderOpts: ${JSON.stringify(restRenderOpts)}
    })

    export default function rscMiddleware(opts) {
      return adapter({
        ...opts,
        handler: render
      })
    }`

  return transformed
}
