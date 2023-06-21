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
import { NextRequestAdapter } from 'next/dist/server/web/spec-extension/adapters/next-request'
import { RouteHandlerManagerContext } from 'next/dist/server/future/route-handler-managers/route-handler-manager'

import { attachRequestMeta } from './next-request-helpers'

import type { RouteModule } from 'next/dist/server/future/route-modules/route-module'

export default (routeModule: RouteModule) => {
  startHandler(async ({ request, response, params }) => {
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
}
