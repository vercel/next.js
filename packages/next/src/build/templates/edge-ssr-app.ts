import '../../server/web/globals'
import { adapter } from '../../server/web/adapter'
import { getRender } from '../webpack/loaders/next-edge-ssr-loader/render'
import { IncrementalCache } from '../../server/lib/incremental-cache'

import { renderToHTMLOrFlight as renderToHTML } from '../../server/app-render/app-render'
import * as pageMod from 'VAR_USERLAND'

import type { DocumentType } from '../../shared/lib/utils'
import type { BuildManifest } from '../../server/get-page-files'
import type { RequestData } from '../../server/web/types'
import type { NextConfigComplete } from '../../server/config-shared'

const Document: DocumentType = null!
const appMod = null
const errorMod = null
const error500Mod = null

// injected by the loader afterwards.
declare const page: string
declare const sriEnabled: boolean
declare const isServerComponent: boolean
declare const dev: boolean
declare const serverActionsBodySizeLimit: any
declare const nextConfig: NextConfigComplete
// INJECT:page
// INJECT:sriEnabled
// INJECT:isServerComponent
// INJECT:dev
// INJECT:serverActionsBodySizeLimit
// INJECT:config

// FIXME: this needs to be made compatible with the template
// ${
//   incrementalCacheHandlerPath
//     ? `import incrementalCacheHandler from ${JSON.stringify(
//         incrementalCacheHandlerPath
//       )}`
//         : 'const incrementalCacheHandler = null'
//     }
const incrementalCacheHandler = null

const maybeJSONParse = (str?: string) => (str ? JSON.parse(str) : undefined)

const buildManifest: BuildManifest = self.__BUILD_MANIFEST as any
const prerenderManifest = maybeJSONParse(self.__PRERENDER_MANIFEST)
const reactLoadableManifest = maybeJSONParse(self.__REACT_LOADABLE_MANIFEST)
const rscManifest = self.__RSC_MANIFEST?.[page]
const rscServerManifest = maybeJSONParse(self.__RSC_SERVER_MANIFEST)
const subresourceIntegrityManifest = sriEnabled
  ? maybeJSONParse(self.__SUBRESOURCE_INTEGRITY_MANIFEST)
  : undefined
const nextFontManifest = maybeJSONParse(self.__NEXT_FONT_MANIFEST)

const render = getRender({
  pagesType: 'app',
  dev,
  page,
  appMod,
  pageMod,
  errorMod,
  error500Mod,
  Document,
  buildManifest,
  prerenderManifest,
  renderToHTML,
  reactLoadableManifest,
  clientReferenceManifest: isServerComponent ? rscManifest : null,
  serverActionsManifest: isServerComponent ? rscServerManifest : null,
  serverActionsBodySizeLimit: isServerComponent
    ? serverActionsBodySizeLimit
    : undefined,
  subresourceIntegrityManifest,
  config: nextConfig,
  buildId: 'VAR_BUILD_ID',
  nextFontManifest,
  incrementalCacheHandler,
})

export const ComponentMod = pageMod

export default function nHandler(opts: { page: string; request: RequestData }) {
  return adapter({
    ...opts,
    IncrementalCache,
    handler: render,
  })
}
