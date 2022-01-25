import type { NextConfig } from '../../../../server/config-shared'

import { NextRequest } from '../../../../server/web/spec-extension/request'
import { toNodeHeaders } from '../../../../server/web/utils'

import WebServer from '../../../../server/web-server'
import { WebNextRequest, WebNextResponse } from '../../../../server/base-http'

const createHeaders = (args?: any) => ({
  ...args,
  'x-middleware-ssr': '1',
  'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
})

function sendError(req: any, error: Error) {
  const defaultMessage = 'An error occurred while rendering ' + req.url + '.'
  return new Response((error && error.message) || defaultMessage, {
    status: 500,
    headers: createHeaders(),
  })
}

export function getRender({
  Document,
  isServerComponent,
  config,
}: {
  Document: any
  isServerComponent: boolean
  config: NextConfig
}) {
  // Used by `path-browserify`.
  process.cwd = () => ''
  const server = new WebServer({
    conf: config,
    minimalMode: true,
  })
  const requestHandler = server.getRequestHandler()

  return async function render(request: NextRequest) {
    const { nextUrl: url, cookies, headers } = request
    const { pathname, searchParams } = url

    const query = Object.fromEntries(searchParams)
    const req = {
      url: pathname,
      cookies,
      headers: toNodeHeaders(headers),
    }

    // Preflight request
    if (request.method === 'HEAD') {
      return new Response(null, {
        headers: createHeaders(),
      })
    }

    if (Document.getInitialProps) {
      const err = new Error(
        '`getInitialProps` in Document component is not supported with `concurrentFeatures` enabled.'
      )
      return sendError(req, err)
    }

    const renderServerComponentData = isServerComponent
      ? query.__flight__ !== undefined
      : false

    const serverComponentProps =
      isServerComponent && query.__props__
        ? JSON.parse(query.__props__)
        : undefined

    // Extend the options.
    Object.assign((self as any).__server_context, {
      renderServerComponentData,
      serverComponentProps,
    })

    const extendedReq = new WebNextRequest(request)
    const transformStream = new TransformStream()
    const extendedRes = new WebNextResponse(transformStream)
    requestHandler(extendedReq, extendedRes)
    return await extendedRes.toResponse()
  }
}
