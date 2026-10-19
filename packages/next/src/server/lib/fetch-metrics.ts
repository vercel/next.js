import type { ServerResponse } from 'http'
import type { FetchMetricsCollection } from '../base-http'
import {
  addRequestMeta,
  getRequestMeta,
  type NextIncomingMessage,
} from '../request-meta'

/** Called by the request handlers that consume and report render metrics. */
export function createFetchMetricsCollection(
  req: NextIncomingMessage,
  res: ServerResponse
): FetchMetricsCollection | undefined {
  if (
    !process.env.__NEXT_DEV_SERVER &&
    !process.env.NEXT_DEBUG_BUILD &&
    process.env.NEXT_SSG_FETCH_METRICS !== '1'
  ) {
    return undefined
  }

  const existing = getRequestMeta(req, 'fetchMetricsCollection')
  if (existing) {
    return existing
  }

  // Background regeneration can begin after the response has already closed.
  const collection = { accepting: !res.closed && !res.destroyed }
  addRequestMeta(req, 'fetchMetricsCollection', collection)
  if (collection.accepting) {
    res.once('close', () => {
      collection.accepting = false
    })
  }
  return collection
}
