import type { NodeNextRequest } from '../../../../base-http/node'
import type { BaseNextRequest } from '../../../../base-http'

import { getRequestMeta } from '../../../../request-meta'
import { NextRequest } from '../../../../web/spec-extension/request'
import { fromNodeHeaders } from '../../../../web/utils'

/**
 * Wraps the base next request to a request compatible with the app route
 * signature.
 *
 * @param req base request to adapt for use with app routes
 * @returns the wrapped request.
 */

export function wrapRequest(req: BaseNextRequest): NextRequest {
  const { originalRequest } = req as NodeNextRequest

  const url = getRequestMeta(originalRequest, '__NEXT_INIT_URL')
  if (!url) throw new Error('Invariant: missing url on request')

  // HEAD and GET requests can not have a body.
  const body: BodyInit | null | undefined =
    req.method !== 'GET' && req.method !== 'HEAD' && req.body ? req.body : null

  return new NextRequest(url, {
    body,
    // @ts-expect-error - see https://github.com/whatwg/fetch/pull/1457
    duplex: 'half',
    method: req.method,
    headers: fromNodeHeaders(req.headers),
  })
}
