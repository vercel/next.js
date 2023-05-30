import { adapter, enhanceGlobals } from 'next/dist/server/web/adapter'
import { getRender } from 'next/dist/esm/build/webpack/loaders/next-edge-ssr-loader/render'
import { IncrementalCache } from 'next/dist/esm/server/lib/incremental-cache'
import { renderToHTMLOrFlight as appRenderToHTML } from 'next/dist/esm/server/app-render/app-render'
import * as pageMod from "APP_ENTRY"
import { createManifests } from './manifest'
const pagesType = "app";
const Document = null
const pagesRenderToHTML = null
const appMod = null
const errorMod = null
const error500Mod = null
const incrementalCacheHandler = null

enhanceGlobals()

const { clientReferenceManifest, serverCSSManifest } = createManifests()
const buildManifest = undefined;
const prerenderManifest = undefined;
const reactLoadableManifest = undefined;
const serverActionsManifest = undefined;
const nextFontManifest = undefined;
const subresourceIntegrityManifest = undefined;

const render = getRender({
  pagesType,
  dev: true,
  page: `/${pageMod.pathname}`,
  appMod,
  pageMod,
  errorMod,
  error500Mod,
  Document,
  buildManifest,
  isAppPath: true,
  prerenderManifest,
  appRenderToHTML,
  pagesRenderToHTML,
  reactLoadableManifest,
  clientReferenceManifest,
  serverCSSManifest,
  serverActionsManifest,
  subresourceIntegrityManifest,
  config: {
    // TODO the whole next config?
  },
  buildId: "development",
  nextFontManifest,
  incrementalCacheHandler,
})

// @ts-expect-error - exposed for edge support
globalThis._ENTRIES = {
  middleware_edge: {
    default: function (opts: any) {
      return adapter({
        ...opts,
        IncrementalCache,
        handler: render
      })
    }
  }
}
