// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from '../internal/api-server-handler'

import 'next/dist/server/node-polyfill-fetch.js'

import { join } from 'node:path'
import { parse as parseUrl } from 'node:url'

import {
  NodeNextRequest,
  NodeNextResponse,
} from 'next/dist/server/base-http/node'

import { attachRequestMeta } from '../internal/next-request-helpers'
import { runEdgeFunction, updateResponse } from '../internal/edge'

import chunkGroup from 'INNER_EDGE_CHUNK_GROUP'

startHandler(async ({ request, response, query, params, path }) => {
  const req = new NodeNextRequest(request)
  const res = new NodeNextResponse(response)

  const parsedUrl = parseUrl(req.url!, true)
  attachRequestMeta(req, parsedUrl, request.headers.host!)

  const edgeInfo = {
    name: 'edge',
    paths: chunkGroup.map((chunk: string) =>
      join(process.cwd(), '.next/server/pages', chunk)
    ),
    wasm: [],
    env: Object.keys(process.env),
    assets: [],
  }

  const result = await runEdgeFunction({
    edgeInfo,
    outputDir: 'pages',
    req,
    query,
    params,
    path,
    onWarning(warning) {
      console.warn(warning)
    },
  })

  await updateResponse(res, result)
})
