import type {
  RequestInsight,
  RequestInsightsSnapshot,
} from '../next-devtools/shared/request-insights'
import { REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES } from '../next-devtools/shared/request-insights'
import {
  getUtf8ByteLength,
  stringifyTerminalSafeJson,
} from '../next-devtools/shared/terminal-safe-json'
import {
  projectSnapshotToLogicalGroups,
  serializeSnapshotForOutput,
} from './next-request-insights'

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

describe('next experimental-request-insights serialization', () => {
  it('limits complete newest logical root groups', () => {
    const oldestRoot = createRequest('oldest')
    const oldestChild = createRequest('oldest-child', {
      rootRequestId: oldestRoot.requestId,
    })
    const newestRoot = createRequest('newest')
    const newestChild = createRequest('newest-child', {
      rootRequestId: newestRoot.requestId,
      kind: 'instant-insights',
    })

    const projected = projectSnapshotToLogicalGroups(
      {
        requests: [oldestRoot, oldestChild, newestRoot, newestChild],
      },
      1
    )

    expect(projected.requests).toEqual([newestRoot, newestChild])
    expect(projected.projection?.omittedRequestGroupCount).toBe(1)

    const reprojected = projectSnapshotToLogicalGroups(projected, 1)
    expect(reprojected.requests).toEqual(projected.requests)
    expect(reprojected.projection).toEqual(projected.projection)
  })

  it('falls back to compact JSON for a bounded near-cap snapshot', () => {
    const sources: RequestInsight['source'][] = [
      'page',
      'app-route',
      'image',
      'proxy',
      'unknown',
    ]
    const snapshot: RequestInsightsSnapshot = {
      requests: Array.from({ length: 800 }, (_request, requestIndex) =>
        createRequest(`request-${requestIndex}`, {
          source: sources[requestIndex % sources.length],
          spans: Array.from({ length: 115 }, (_span, spanIndex) => ({
            name: `operation-${spanIndex}`,
            startTime: spanIndex,
          })),
        })
      ),
    }
    const compact = stringifyTerminalSafeJson(snapshot)
    const pretty = stringifyTerminalSafeJson(snapshot, 2)

    expect(getUtf8ByteLength(compact)).toBeGreaterThan(3.5 * 1024 * 1024)
    expect(getUtf8ByteLength(compact)).toBeLessThan(
      REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES
    )
    expect(getUtf8ByteLength(pretty)).toBeGreaterThan(
      REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES
    )

    const output = serializeSnapshotForOutput(snapshot, 2)

    expect(output).toBe(compact)
    expect(getUtf8ByteLength(output)).toBeLessThanOrEqual(
      REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES
    )
    expect(
      (JSON.parse(output) as RequestInsightsSnapshot).requests
    ).toHaveLength(snapshot.requests.length)
  })
})
