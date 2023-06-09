// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from '../../internal/api-server-handler'

import '../../polyfill/app-polyfills'

import { parse as parseUrl } from 'node:url'

import {
  NodeNextRequest,
  NodeNextResponse,
} from 'next/dist/server/base-http/node'
import { sendResponse } from 'next/dist/server/send-response'
import { NextRequestAdapter } from 'next/dist/server/web/spec-extension/adapters/next-request'
import { RouteHandlerManagerContext } from 'next/dist/server/future/route-handler-managers/route-handler-manager'

import { attachRequestMeta } from '../../internal/next-request-helpers'

import RouteModule from 'ROUTE_MODULE'
import * as userland from 'ENTRY'
import { PAGE, PATHNAME, KIND } from 'BOOTSTRAP_CONFIG'

const routeModule = new RouteModule({
  userland,
  definition: {
    page: PAGE,
    kind: KIND,
    pathname: PATHNAME,
    // The following aren't used in production.
    filename: '',
    bundlePath: '',
  },
  resolvedPagePath: `app/${PAGE}`,
  nextConfigOutput: undefined,
})

startHandler(async ({ request, response, query, params, path }) => {
  const req = new NodeNextRequest(request)
  const res = new NodeNextResponse(response)

  const parsedUrl = parseUrl(req.url!, true)
  attachRequestMeta(req, parsedUrl, request.headers.host!)

  const context: RouteHandlerManagerContext = {
    params,
    prerenderManifest: {
      version: -1 as any, // letting us know this doesn't conform to spec
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: {
        previewModeId: 'development-id',
      } as any,
    },
    staticGenerationContext: {
      supportsDynamicHTML: true,
    },
  }

  const routeResponse = await routeModule.handle(
    NextRequestAdapter.fromNodeNextRequest(req),
    context
  )

  await sendResponse(req, res, routeResponse)
})
