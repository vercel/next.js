// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from './api-server-handler'

import '../polyfill/app-polyfills'

import { parse as parseUrl } from 'node:url'

import {
  NodeNextRequest,
  NodeNextResponse,
} from 'next/dist/server/base-http/node'
import { sendResponse } from 'next/dist/server/send-response'
import {
  NextRequestAdapter,
  signalFromNodeResponse,
} from 'next/dist/server/web/spec-extension/adapters/next-request'

import { attachRequestMeta } from './next-request-helpers'

import type {
  AppRouteRouteHandlerContext,
  AppRouteRouteModule,
} from 'next/dist/server/future/route-modules/app-route/module'

export default (routeModule: AppRouteRouteModule) => {
  startHandler(async ({ request, response, params }) => {
    const req = new NodeNextRequest(request)
    const res = new NodeNextResponse(response)

    const parsedUrl = parseUrl(req.url!, true)
    attachRequestMeta(req, parsedUrl, request.headers.host!)

    const context: AppRouteRouteHandlerContext = {
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
      NextRequestAdapter.fromNodeNextRequest(
        req,
        signalFromNodeResponse(response)
      ),
      context
    )

    await sendResponse(req, res, routeResponse)
  })
}
