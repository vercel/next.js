import { stringifyRequest } from '../../stringify-request'

export default async function middlewareRSCLoader(this: any) {
  const {
    absolutePagePath,
    absoluteAppPath,
    absoluteDocumentPath,
    absoluteErrorPath,
    isServerComponent,
    ...restRenderOpts
  } = this.getOptions()

  const stringifiedAbsolutePagePath = stringifyRequest(this, absolutePagePath)
  const stringifiedAbsoluteAppPath = stringifyRequest(this, absoluteAppPath)
  const stringifiedAbsoluteErrorPath = stringifyRequest(this, absoluteErrorPath)
  const stringified500PagePath = stringifyRequest(this, './pages/500')
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

    let ErrorPage
    try {
      ErrorPage = require(${stringified500PagePath}).default
    } catch (_) {
      ErrorPage = require(${stringifiedAbsoluteErrorPath}).default
    }

    const {
      default: Component,
      config,
      getStaticProps,
      getServerSideProps,
      getStaticPaths
    } = require(${stringifiedAbsolutePagePath})

    const buildManifest = self.__BUILD_MANIFEST
    const reactLoadableManifest = self.__REACT_LOADABLE_MANIFEST
    const rscManifest = self.__RSC_MANIFEST

    if (typeof Component !== 'function') {
      throw new Error('Your page must export a \`default\` component')
    }

    const render = getRender({
      App,
      Document,
      Component,
      ErrorPage,
      config,
      getStaticProps,
      getServerSideProps,
      getStaticPaths,
      buildManifest,
      reactLoadableManifest,
      rscManifest,
      isServerComponent: ${JSON.stringify(isServerComponent)},
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
