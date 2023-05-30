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

startOperationStreamHandler(async (renderData: RenderData, respond) => {
  const result = await runOperation(renderData)

  console.log(result);

  if (result == null) {
    throw new Error('no html returned')
  }

  const channel = respond({
    status: result.statusCode,
    headers: result.headers,
  })

  for await (const chunk of result.body) {
    channel.chunk(chunk as Buffer)
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
  const incoming: IncomingMessage = {
    url: renderData.originalUrl,
    method: renderData.method,
    headers: initProxiedHeaders(
      headersFromEntries(renderData.rawHeaders),
      renderData.data?.serverInfo
    ),
  } as any
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

  return res;
}
