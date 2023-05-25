// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import { IPC } from '@vercel/turbopack-node/ipc/index'

import '../polyfill/app-polyfills.ts'

import type { Ipc } from '@vercel/turbopack-node/ipc/index'
import type { IncomingMessage } from 'node:http'

import type { RenderData } from 'types/turbopack'
import type { RenderOpts } from 'next/dist/server/app-render/types'

import { renderToHTMLOrFlight } from 'next/dist/server/app-render/app-render'
import { RSC_VARY_HEADER } from 'next/dist/client/components/app-router-headers'
import { headersFromEntries, initProxiedHeaders } from '../internal/headers'
import { parse, ParsedUrlQuery } from 'node:querystring'
import { PassThrough } from 'node:stream'
;('TURBOPACK { chunking-type: isolatedParallel }')
import entry from 'APP_ENTRY'
import BOOTSTRAP from 'APP_BOOTSTRAP'
import { createServerResponse } from '../internal/http'
import { createManifests, installRequireAndChunkLoad } from './app/manifest'

installRequireAndChunkLoad()

process.env.__NEXT_NEW_LINK_BEHAVIOR = 'true'

const ipc = IPC as Ipc<IpcIncomingMessage, IpcOutgoingMessage>

type IpcIncomingMessage = {
  type: 'headers'
  data: RenderData
}

type IpcOutgoingMessage =
  | {
      type: 'headers'
      data: {
        status: number
        headers: [string, string][]
      }
    }
  | {
      type: 'bodyChunk'
      data: number[]
    }
  | {
      type: 'bodyEnd'
    }

const MIME_TEXT_HTML_UTF8 = 'text/html; charset=utf-8'

;(async () => {
  while (true) {
    const msg = await ipc.recv()

    let renderData: RenderData
    switch (msg.type) {
      case 'headers': {
        renderData = msg.data
        break
      }
      default: {
        console.error('unexpected message type', msg.type)
        process.exit(1)
      }
    }

    const result = await runOperation(renderData)

    if (result == null) {
      throw new Error('no html returned')
    }

    ipc.send({
      type: 'headers',
      data: {
        status: result.statusCode,
        headers: result.headers,
      },
    })

    for await (const chunk of result.body) {
      ipc.send({
        type: 'bodyChunk',
        data: (chunk as Buffer).toJSON().data,
      })
    }

    ipc.send({ type: 'bodyEnd' })
  }
})().catch((err) => {
  ipc.sendError(err)
})

async function runOperation(renderData: RenderData) {
  const { clientReferenceManifest, serverCSSManifest } = createManifests()

  const req: IncomingMessage = {
    url: renderData.originalUrl,
    method: renderData.method,
    headers: initProxiedHeaders(
      headersFromEntries(renderData.rawHeaders),
      renderData.data?.serverInfo
    ),
  } as any

  const res = createServerResponse(req, renderData.path)

  const query = parse(renderData.rawQuery)
  const renderOpt: Omit<
    RenderOpts,
    'App' | 'Document' | 'Component' | 'pathname'
  > & {
    params: ParsedUrlQuery
  } = {
    // TODO: give an actual buildId when next build is supported
    buildId: 'development',
    params: renderData.params,
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
    runtime: 'nodejs',
    serverComponents: true,
    assetPrefix: '',
    pageConfig: {},
    reactLoadableManifest: {},
    nextConfigOutput: renderData.data?.nextConfigOutput,
  }
  const result = await renderToHTMLOrFlight(
    req,
    res,
    renderData.path,
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

// This utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE

const ESCAPE_LOOKUP = {
  '&': '\\u0026',
  '>': '\\u003e',
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

const ESCAPE_REGEX = /[&><\u2028\u2029]/g

export function htmlEscapeJsonString(str: string) {
  return str.replace(
    ESCAPE_REGEX,
    (match) => ESCAPE_LOOKUP[match as keyof typeof ESCAPE_LOOKUP]
  )
}
