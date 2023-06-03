import { adapter, enhanceGlobals } from 'next/dist/server/web/adapter'
import { RSC_VARY_HEADER } from 'next/dist/client/components/app-router-headers'
import { IncrementalCache } from 'next/dist/server/lib/incremental-cache'
import { renderToHTMLOrFlight } from 'next/dist/server/app-render/app-render'
;('TURBOPACK { chunking-type: isolatedParallel }')
import entry from "APP_ENTRY"
import BOOTSTRAP from 'APP_BOOTSTRAP'
import { createManifests, installRequireAndChunkLoad } from './manifest'
import { type NextRequest, NextFetchEvent } from 'next/server'
import { RenderOpts } from 'next/dist/server/app-render/types'
import type { ParsedUrlQuery } from 'querystring'
import { WebNextRequest, WebNextResponse } from 'next/dist/server/base-http/web';

enhanceGlobals()
installRequireAndChunkLoad()

const { clientReferenceManifest, serverCSSManifest } = createManifests()

const MIME_TEXT_HTML_UTF8 = 'text/html; charset=utf-8'

async function render(request: NextRequest, event: NextFetchEvent) {
  const renderOpt: Omit<
    RenderOpts,
    'App' | 'Document' | 'Component' | 'pathname'
  > & { params: ParsedUrlQuery } = {
    // TODO params
    params: {},
    supportsDynamicHTML: true,
    dev: true,
    buildManifest: {
      polyfillFiles: [],
      rootMainFiles: BOOTSTRAP.filter((path) => path.endsWith('.js')),
      devFiles: [],
      ampDevFiles: [],
      lowPriorityFiles: [],
      pages: {
        '/_app': [],
      },
      ampFirstPages: [],
    },
    ComponentMod: {
      ...entry,
      __next_app_require__: __next_require__,
      pages: ['page.js'],
    },
    clientReferenceManifest,
    serverCSSManifest,
    runtime: 'nodejs',
    serverComponents: true,
    assetPrefix: '',
    pageConfig: {},
    reactLoadableManifest: {},
    // TODO nextConfigOutput 
    nextConfigOutput: undefined,
  };

  const extendedReq = new WebNextRequest(request)
  const extendedRes = new WebNextResponse()

  let [,pathname, query] = /^([^?]*)(.*)$/.exec(request.url)!;

  const result = await renderToHTMLOrFlight(
    extendedReq as any,
    extendedRes as any,
    pathname,
    // TODO query
    {},
    renderOpt as any as RenderOpts
  )
  
  extendedRes.setHeader('Content-Type', MIME_TEXT_HTML_UTF8)
  extendedRes.setHeader('Vary', RSC_VARY_HEADER)
  
  result.pipe(extendedRes)
  
  return await extendedRes.toResponse();
}

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
