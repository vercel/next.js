import type { RequestInsight } from '../next-devtools/shared/request-insights'
import { isRequestInsightsSnapshot } from './next-request-insights'

function createRequest(
  requestId: string,
  overrides: Partial<RequestInsight> = {}
): RequestInsight {
  return {
    requestId,
    source: 'page',
    htmlRequestId: requestId,
    route: `/${requestId}`,
    startTime: 0,
    status: 'ok',
    spans: [],
    fetches: [],
    ...overrides,
  }
}

describe('next experimental-request-insights schema', () => {
  it('accepts the combined response lifecycle and causality fields', () => {
    const snapshot = {
      requests: [
        createRequest('child', {
          rootRequestId: 'child',
          parentRootRequestId: 'parent',
          parentFetchIndex: 2,
          status: 'aborted',
          response: {
            trackingStartTime: 1,
            endTime: 2,
            statusCode: 200,
            outcome: 'aborted',
            error: { type: 'ResponseAborted' },
          },
        }),
      ],
    }

    expect(isRequestInsightsSnapshot(snapshot)).toBe(true)
    expect(
      isRequestInsightsSnapshot({
        requests: [
          {
            ...snapshot.requests[0],
            parentFetchIndex: -1,
          },
        ],
      })
    ).toBe(false)
    expect(
      isRequestInsightsSnapshot({
        requests: [
          {
            ...snapshot.requests[0],
            response: {
              ...snapshot.requests[0].response,
              outcome: 'closed',
            },
          },
        ],
      })
    ).toBe(false)
    expect(
      isRequestInsightsSnapshot({
        requests: [{ ...snapshot.requests[0], spans: [null] }],
      })
    ).toBe(false)
  })
})
