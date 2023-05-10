import type { BaseNextRequest } from '../../../base-http'
import type { NodeNextRequest } from '../../../base-http/node'
import type { WebNextRequest } from '../../../base-http/web'

import { getRequestMeta } from '../../../request-meta'
import { fromNodeHeaders } from '../../utils'
import { NextRequest } from '../request'

export class NextRequestAdapter {
  public static fromBaseNextRequest(request: BaseNextRequest): NextRequest {
    // TODO: look at refining this check
    if ('request' in request && (request as WebNextRequest).request) {
      return NextRequestAdapter.fromWebNextRequest(request as WebNextRequest)
    }

    return NextRequestAdapter.fromNodeNextRequest(request as NodeNextRequest)
  }

  public static fromNodeNextRequest(request: NodeNextRequest): NextRequest {
    // HEAD and GET requests can not have a body.
    let body: BodyInit | null = null
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
      // @ts-expect-error - this is handled by undici, when streams/web land use it instead
      body = request.body
    }

    let url: URL
    if (request.url.startsWith('http')) {
      url = new URL(request.url)
    } else {
      // Grab the full URL from the request metadata.
      const base = getRequestMeta(request, '__NEXT_INIT_URL')
      if (!base) throw new Error('Invariant: missing url on request')

      url = new URL(request.url, base)
    }

    return new NextRequest(url, {
      body,
      method: request.method,
      headers: fromNodeHeaders(request.headers),
      // @ts-expect-error - see https://github.com/whatwg/fetch/pull/1457
      duplex: 'half',
      // geo
      // ip
      // nextConfig
    })
  }

  public static fromWebNextRequest(request: WebNextRequest): NextRequest {
    // HEAD and GET requests can not have a body.
    let body: ReadableStream | null = null
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = request.body
    }

    return new NextRequest(request.url, {
      body,
      method: request.method,
      headers: fromNodeHeaders(request.headers),
      // @ts-expect-error - see https://github.com/whatwg/fetch/pull/1457
      duplex: 'half',
      // geo
      // ip
      // nextConfig
    })
  }
}
