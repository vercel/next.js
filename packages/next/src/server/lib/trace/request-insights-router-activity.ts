import {
  NEXT_HMR_REFRESH_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  RSC_HEADER,
} from '../../../client/components/app-router-headers'
import type { RequestInsightRouterActivity } from '../../../shared/lib/request-insights'
import { isRSCRequestHeader } from '../is-rsc-request'

type RouterHeaders = Record<string, string | string[] | undefined>

export function getRequestInsightRouterActivity(
  headers: RouterHeaders
): RequestInsightRouterActivity | undefined {
  if (!isRSCRequestHeader(headers[RSC_HEADER])) {
    return undefined
  }

  if (headers[NEXT_HMR_REFRESH_HEADER] === '1') {
    return 'hmr-refresh'
  }

  const prefetch = headers[NEXT_ROUTER_PREFETCH_HEADER]
  if (prefetch !== '1' && prefetch !== '2' && prefetch !== '3') {
    return undefined
  }

  if (
    prefetch === '1' &&
    typeof headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] === 'string'
  ) {
    return 'segment-prefetch'
  }

  return 'prefetch'
}
