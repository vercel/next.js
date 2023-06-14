// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from '../../internal/api-server-handler'

import 'next/dist/server/node-polyfill-fetch.js'

import { join } from 'path'
import { parse as parseUrl } from 'node:url'

import {
  NodeNextRequest,
  NodeNextResponse,
} from 'next/dist/server/base-http/node'

import { runEdgeFunction } from '../../internal/edge'
import { attachRequestMeta } from '../../internal/next-request-helpers'

import chunkGroup from 'ROUTE_CHUNK_GROUP'

startHandler(async ({ request, response, query, params, path }) => {
  const req = new NodeNextRequest(request)
  const res = new NodeNextResponse(response)

  const parsedUrl = parseUrl(req.url!, true)
  attachRequestMeta(req, parsedUrl, request.headers.host!)

  const edgeInfo = {
    name: 'edge',
    paths: chunkGroup.map((chunk) =>
      join(process.cwd(), '.next/server/app', chunk)
    ),
    wasm: [],
    env: Object.keys(process.env),
    assets: [],
  }

  await runEdgeFunction({
    edgeInfo,
    outputDir: 'app',
    req,
    res,
    query,
    params,
    path,
    onWarning(warning) {
      console.warn(warning)
    },
  })
})
