import 'next/dist/esm/server/web/globals'
import { adapter } from 'next/dist/server/web/adapter'
import { RSC_VARY_HEADER } from 'next/dist/client/components/app-router-headers'
import { IncrementalCache } from 'next/dist/server/lib/incremental-cache'
import { renderToHTMLOrFlight } from 'next/dist/server/app-render/app-render'
;('TURBOPACK { chunking-type: isolatedParallel }')
import entry from 'APP_ENTRY'
import BOOTSTRAP from 'APP_BOOTSTRAP'
import { createManifests, installRequireAndChunkLoad } from './manifest'
import type { NextRequest, NextFetchEvent } from 'next/server'
import type { RenderOpts } from 'next/dist/server/app-render/types'
import type { ParsedUrlQuery } from 'querystring'

installRequireAndChunkLoad()

// avoid limiting stack traces to 10 lines
Error.stackTraceLimit = 100

const { clientReferenceManifest } = createManifests()

const MIME_TEXT_HTML_UTF8 = 'text/html; charset=utf-8'

async function render(request: NextRequest, event: NextFetchEvent) {
  const renderOpt: Omit<
    RenderOpts,
    'App' | 'Document' | 'Component' | 'pathname'
  > & { params: ParsedUrlQuery } = {
    // TODO(WEB-1195) params
    params: {},
    supportsDynamicHTML: true,
    dev: true,
    buildId: 'development',
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
      __next_app__: {
        require: __next_require__,
        loadChunk: __next_chunk_load__,
      },
      pages: ['page.js'],
    },
    clientReferenceManifest,
    runtime: 'nodejs',
    serverComponents: true,
    assetPrefix: '',
    pageConfig: {},
    reactLoadableManifest: {},
    // TODO nextConfigOutput
    nextConfigOutput: undefined,
  }

  const tranform = new TransformStream()
  const response = new Response(tranform.readable)

  let { pathname, search: query } = new URL(request.url, 'next://')

  const result = await renderToHTMLOrFlight(
    // @ts-expect-error - TODO renderToHTMLOrFlight types should accept web platform types
    request,
    response,
    pathname,
    // TODO(WEB-1195) query
    {},
    renderOpt as any as RenderOpts
  )

  response.headers.append(
    'Content-Type',
    result.contentType() || MIME_TEXT_HTML_UTF8
  )
  response.headers.append('Vary', RSC_VARY_HEADER)

  const writer = tranform.writable.getWriter()
  result.pipe({
    write: (chunk: Uint8Array) => writer.write(chunk),
    end: () => writer.close(),
    destroy: (reason?: Error) => writer.abort(reason),
  })

  return response
}

// adapter uses this to detect edge rendering
self.__BUILD_MANIFEST = {}

// @ts-expect-error - exposed for edge support
globalThis._ENTRIES = {
  middleware_edge: {
    default: function (opts: any) {
      return adapter({
        ...opts,
        IncrementalCache,
        handler: render,
      })
    },
  },
}
