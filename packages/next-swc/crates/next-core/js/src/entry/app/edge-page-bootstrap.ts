import { adapter, enhanceGlobals } from 'next/dist/server/web/adapter'
import { RSC_VARY_HEADER } from 'next/dist/client/components/app-router-headers'
import { IncrementalCache } from 'next/dist/server/lib/incremental-cache'
import { renderToHTMLOrFlight } from 'next/dist/server/app-render/app-render'
;('TURBOPACK { chunking-type: isolatedParallel }')
import entry from "APP_ENTRY"
import BOOTSTRAP from 'APP_BOOTSTRAP'
import { createManifests, installRequireAndChunkLoad } from './manifest'
import { NextResponse, type NextRequest, NextFetchEvent } from 'next/server'
import { RenderOpts } from 'next/dist/server/app-render/types'
import type { ParsedUrlQuery } from 'querystring'
import type { IncomingMessage } from 'http';
import { WebNextRequest } from 'next/dist/server/base-http/web';

enhanceGlobals()
installRequireAndChunkLoad()

const { clientReferenceManifest, serverCSSManifest } = createManifests()

const MIME_TEXT_HTML_UTF8 = 'text/html; charset=utf-8'

async function render(request: NextRequest, event: NextFetchEvent) {
  const res = new NextResponse(undefined, {
    headers: {
      'Content-Type': MIME_TEXT_HTML_UTF8,
      'Vary': RSC_VARY_HEADER,
    }
  })

  const renderOpt: Omit<
    RenderOpts,
    'App' | 'Document' | 'Component' | 'pathname'
  > & { params: ParsedUrlQuery } = {
    // TODO params
    params: request.page.params,
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

  const req = new WebNextRequest

  const result = await renderToHTMLOrFlight(
    request as IncomingMessage,
    res,
    request.page,
    query,
    renderOpt as any as RenderOpts
  )

  if (!result || result.isNull())
    throw new Error('rendering was not successful')

  const body = new PassThrough()
  if (result.isDynamic()) {
    result.pipe(body)
  } else {
    body.write(result.toUnchunkedString())
  }
  return {
    statusCode: res.statusCode,
    headers: [
      ['Content-Type', result.contentType() ?? MIME_TEXT_HTML_UTF8],
      ['Vary', RSC_VARY_HEADER],
    ] as [string, string][],
    body,
  }
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
