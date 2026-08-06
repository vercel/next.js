import type {
  RequestInsight,
  RequestInsightsSnapshot,
} from '../../../next-devtools/shared/request-insights'
import {
  getRequestInsightsInputSchema,
  serializeRequestInsightsSnapshotForMcp,
} from './get-request-insights'
import {
  getUtf8ByteLength,
  stringifyTerminalSafeJson,
} from '../../../next-devtools/shared/terminal-safe-json'
import { REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES } from '../../../next-devtools/shared/request-insights'

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

describe('get_request_insights', () => {
  it('bounds request identifiers and logical group limits', () => {
    expect(
      getRequestInsightsInputSchema.requestId.safeParse('a'.repeat(128)).success
    ).toBe(true)
    expect(
      getRequestInsightsInputSchema.requestId.safeParse('a'.repeat(129)).success
    ).toBe(false)
    expect(
      getRequestInsightsInputSchema.htmlRequestId.safeParse('').success
    ).toBe(false)
    expect(
      getRequestInsightsInputSchema.requestId.safeParse('unsafe/id').success
    ).toBe(false)
    expect(getRequestInsightsInputSchema.limit.safeParse(1).success).toBe(true)
    expect(getRequestInsightsInputSchema.limit.safeParse(200).success).toBe(
      true
    )
    expect(getRequestInsightsInputSchema.limit.safeParse(0).success).toBe(false)
    expect(getRequestInsightsInputSchema.limit.safeParse(201).success).toBe(
      false
    )
    expect(getRequestInsightsInputSchema.limit.safeParse(1.5).success).toBe(
      false
    )
  })

  it('escapes terminal controls in serialized MCP output', () => {
    const unsafe = '\u0085\u202e\u2067'
    const snapshot: RequestInsightsSnapshot = {
      requests: [
        createRequest('request', {
          route: `/safe-${unsafe}`,
          spans: [{ name: unsafe, startTime: 0 }],
        }),
      ],
    }

    const text = serializeRequestInsightsSnapshotForMcp(snapshot)

    expect(text).toBe(stringifyTerminalSafeJson(snapshot))
    expect(hasUnsafeTerminalControl(text)).toBe(false)
    expect(JSON.parse(text).requests[0].route).toBe(`/safe-${unsafe}`)
  })

  it('trims whole newest logical groups after terminal escaping expands the output', () => {
    const unsafe = '\u0085'.repeat(14_000)
    const requests = Array.from({ length: 70 }, (_, index) => {
      const rootRequestId = `root-${index}`
      return [
        createRequest(rootRequestId, {
          spans: [{ name: unsafe, startTime: index }],
        }),
        createRequest(`instant-${index}`, {
          kind: 'instant-insights',
          rootRequestId,
          source: 'instant-insights',
          spans: [{ name: unsafe, startTime: index }],
        }),
      ]
    }).flat()
    const snapshot: RequestInsightsSnapshot = {
      requests,
      projection: {
        omittedRequestGroupCount: 2,
        buckets: [{ bucket: 'page', omittedRequestGroupCount: 2 }],
      },
    }

    expect(getUtf8ByteLength(JSON.stringify(snapshot))).toBeLessThan(
      REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES
    )
    expect(
      getUtf8ByteLength(stringifyTerminalSafeJson(snapshot))
    ).toBeGreaterThan(REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES)

    const text = serializeRequestInsightsSnapshotForMcp(snapshot)
    const output = JSON.parse(text) as RequestInsightsSnapshot
    const recordsByRoot = new Map<string, number>()
    for (const request of output.requests) {
      const rootRequestId = request.rootRequestId ?? request.requestId
      recordsByRoot.set(
        rootRequestId,
        (recordsByRoot.get(rootRequestId) ?? 0) + 1
      )
    }

    expect(getUtf8ByteLength(text)).toBeLessThanOrEqual(
      REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES
    )
    expect(hasUnsafeTerminalControl(text)).toBe(false)
    expect(output.requests.length).toBeLessThan(requests.length)
    expect(new Set(recordsByRoot.values())).toEqual(new Set([2]))
    expect(Array.from(recordsByRoot.keys())).toEqual(
      Array.from(
        { length: recordsByRoot.size },
        (_, index) => `root-${70 - recordsByRoot.size + index}`
      )
    )
    expect(output.projection?.omittedRequestGroupCount).toBe(
      2 + (70 - recordsByRoot.size)
    )
    expect(output.projection?.buckets).toEqual([
      {
        bucket: 'page',
        omittedRequestGroupCount: 2 + (70 - recordsByRoot.size),
      },
    ])
  })
})

function hasUnsafeTerminalControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x061c ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    )
  })
}
