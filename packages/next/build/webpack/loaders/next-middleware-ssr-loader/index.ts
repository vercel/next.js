import { join } from 'path'

import { stringifyRequest } from '../../stringify-request'
import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
} from '../../../../shared/lib/constants'
import { DOT_NEXT_ALIAS } from '../../../../lib/constants'

export default async function middlewareSSRLoader(this: any) {
  const {
    absolutePagePath,
    absoluteAppPath,
    absoluteDocumentPath,
    absolute500Path,
    absoluteErrorPath,
    isServerComponent,
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
  const buildManifest = join(DOT_NEXT_ALIAS, BUILD_MANIFEST).replace(/\\/g, '/')
  const ReactLoadableManifest = join(
    DOT_NEXT_ALIAS,
    REACT_LOADABLE_MANIFEST
  ).replace(/\\/g, '/')

  const transformed = `
    import { adapter } from 'next/dist/server/web/adapter'
    import { RouterContext } from 'next/dist/shared/lib/router-context'

    import App from ${stringifiedAbsoluteAppPath}
    import Document from ${stringifiedAbsoluteDocumentPath}

    import buildManifest from '${buildManifest}'
    import reactLoadableManifest from '${ReactLoadableManifest}'

    import { getRender } from 'next/dist/build/webpack/loaders/next-middleware-ssr-loader/render'

    const pageMod = require(${stringifiedAbsolutePagePath})
    const errorMod = require(${stringifiedAbsolute500PagePath})

    const rscManifest = self.__RSC_MANIFEST

    if (typeof pageMod.default !== 'function') {
      throw new Error('Your page must export a \`default\` component')
    }

    const render = getRender({
      App,
      Document,
      pageMod,
      errorMod,
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
