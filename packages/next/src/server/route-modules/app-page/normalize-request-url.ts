import type { IncomingMessage } from 'http'

import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  RSC_HEADER,
} from '../../../client/components/app-router-headers'
import type { BaseNextRequest } from '../../base-http'
import { isRSCRequestHeader } from '../../lib/is-rsc-request'
import { parseReqUrl } from '../../../lib/url'
import { formatUrl } from '../../../shared/lib/router/utils/format-url'
import { addRequestMeta } from '../../request-meta'

function getHeaderValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

export function applyAppPageRscRequestMetaFromHeaders(
  req: Pick<IncomingMessage | BaseNextRequest, 'headers'>
): void {
  const isRscRequest = isRSCRequestHeader(req.headers[RSC_HEADER])
  if (!isRscRequest) {
    return
  }

  addRequestMeta(req as IncomingMessage, 'isRSCRequest', true)

  const isPrefetchRequest =
    getHeaderValue(req.headers[NEXT_ROUTER_PREFETCH_HEADER]) === '1'
  if (!isPrefetchRequest) {
    return
  }

  addRequestMeta(req as IncomingMessage, 'isPrefetchRSCRequest', true)

  const segmentPrefetchPath = getHeaderValue(
    req.headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]
  )
  if (segmentPrefetchPath) {
    addRequestMeta(
      req as IncomingMessage,
      'segmentPrefetchRSCRequest',
      segmentPrefetchPath
    )
  }
}

export function normalizeAppPageRequestUrl(
  req: Pick<IncomingMessage | BaseNextRequest, 'url'>,
  pathname: string
) {
  if (!req.url) {
    return
  }

  const normalizedUrl = parseReqUrl(req.url)
  if (!normalizedUrl) {
    return
  }

  normalizedUrl.pathname = pathname
  req.url = formatUrl(normalizedUrl)
}
