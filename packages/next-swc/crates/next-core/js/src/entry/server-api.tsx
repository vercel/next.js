// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from '../internal/api-server-handler'

import 'next/dist/server/node-polyfill-fetch.js'

import * as allExports from 'INNER'
import { apiResolver } from 'next/dist/server/api-utils/node'
import {
  NodeNextRequest,
  NodeNextResponse,
} from 'next/dist/server/base-http/node'
import { parse } from 'node:querystring'

startHandler(({ request, response, query, params, path }) => {
  const parsedQuery = parse(query)

  const mergedQuery = { ...parsedQuery, ...params }

  // This enables `req.cookies` in API routes.
  const req = new NodeNextRequest(request)
  const res = new NodeNextResponse(response)

  return apiResolver(
    req.originalRequest,
    res.originalResponse,
    mergedQuery,
    allExports,
    {
      previewModeId: '',
      previewModeEncryptionKey: '',
      previewModeSigningKey: '',
    },
    false,
    true,
    path
  )
})
