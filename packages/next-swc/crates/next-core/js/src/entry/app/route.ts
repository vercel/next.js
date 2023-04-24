// IPC need to be the first import to allow it to catch errors happening during
// the other imports
import startHandler from '../../internal/api-server-handler'

import '../../polyfill/app-polyfills'

import {
  NodeNextRequest,
  NodeNextResponse,
} from 'next/dist/server/base-http/node'
import { sendResponse } from 'next/dist/server/send-response'
import { NextRequestAdapter } from 'next/dist/server/web/spec-extension/adapters/next-request'
import { RouteHandlerManagerContext } from 'next/dist/server/future/route-handler-managers/route-handler-manager'
import { parse } from 'url'

import RouteModule from 'ROUTE_MODULE'
import * as userland from 'ENTRY'
import { PAGE, PATHNAME } from 'BOOTSTRAP_CONFIG'
import { BaseNextRequest } from 'next/dist/server/base-http'
import {
  addRequestMeta,
  NextUrlWithParsedQuery,
} from 'next/dist/server/request-meta'
import { TLSSocket } from 'tls'
import { getCloneableBody } from 'next/dist/server/body-streams'

const routeModule = new RouteModule({
  userland,
  pathname: PATHNAME,
  resolvedPagePath: `app/${PAGE}`,
  nextConfigOutput: undefined,
})

startHandler(async ({ request, response, query, params, path }) => {
  const req = new NodeNextRequest(request)
  const res = new NodeNextResponse(response)

  const parsedUrl = parse(req.url!, true)
  attachRequestMeta(req, parsedUrl, 'localhost', 3000)

  const context: RouteHandlerManagerContext = {
    params,
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

function attachRequestMeta(
  req: BaseNextRequest,
  parsedUrl: NextUrlWithParsedQuery,
  hostname: string,
  port: number
) {
  const protocol = (
    (req as NodeNextRequest).originalRequest?.socket as TLSSocket
  )?.encrypted
    ? 'https'
    : 'http'

  const initUrl = `${protocol}://${hostname}:${port}${req.url}`

  addRequestMeta(req, '__NEXT_INIT_URL', initUrl)
  addRequestMeta(req, '__NEXT_INIT_QUERY', { ...parsedUrl.query })
  addRequestMeta(req, '_protocol', protocol)
  addRequestMeta(req, '__NEXT_CLONABLE_BODY', getCloneableBody(req.body))
}
