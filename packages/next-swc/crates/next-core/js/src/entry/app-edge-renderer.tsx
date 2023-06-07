// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startOperationStreamHandler from '../internal/operation-stream'

import { join } from 'path'
import { parse as parseUrl } from 'node:url'

import { runEdgeFunction } from '../internal/edge'
import { headersFromEntries, initProxiedHeaders } from '../internal/headers'
import { NodeNextRequest } from 'next/dist/server/base-http/node'

import type { IncomingMessage } from 'node:http'
import type { RenderData } from 'types/turbopack'

import chunkGroup from 'INNER_EDGE_CHUNK_GROUP'
import { attachRequestMeta } from '../internal/next-request-helpers'
import { Readable } from 'stream'

startOperationStreamHandler(async (renderData: RenderData, respond) => {
  const { response } = await runOperation(renderData)

  if (response == null) {
    throw new Error('no html returned')
  }

  const channel = respond({
    status: response.status,
    // @ts-expect-error Headers is iterable since node.js 18
    headers: [...response.headers],
  })

  if (response.body) {
    const reader = response.body.getReader()
    for (;;) {
      let { done, value } = await reader.read()
      if (done) {
        break
      }
      channel.chunk(Buffer.from(value!))
    }
  }

  channel.end()
})

async function runOperation(renderData: RenderData) {
  const edgeInfo = {
    name: 'edge',
    paths: chunkGroup.map((chunk: string) =>
      join(process.cwd(), '.next/server/app', chunk)
    ),
    wasm: [],
    env: Object.keys(process.env),
    assets: [],
  }

  const parsedUrl = parseUrl(renderData.originalUrl, true)
  const incoming = new Readable() as IncomingMessage
  incoming.push(null)
  incoming.url = renderData.originalUrl
  incoming.method = renderData.method
  incoming.headers = initProxiedHeaders(
    headersFromEntries(renderData.rawHeaders),
    renderData.data?.serverInfo
  )
  const req = new NodeNextRequest(incoming)
  attachRequestMeta(req, parsedUrl, req.headers.host!)

  const res = await runEdgeFunction({
    edgeInfo,
    outputDir: 'edge-pages',
    req,
    query: renderData.rawQuery,
    params: renderData.params,
    path: renderData.path,
    onWarning(warning) {
      console.warn(warning)
    },
  })

  return res as { response: Response }
}
