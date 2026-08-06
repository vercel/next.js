import type {
  RequestInsight,
  RequestInsightsCaptureState,
} from '../../../shared/request-insights'
import {
  getCaptureOmissionPresentation,
  getCaptureUsagePresentation,
} from './capture-usage'

function createCaptureState(): RequestInsightsCaptureState {
  return {
    limits: {
      maxRequestGroupsPerBucket: 200,
      maxBytesPerBucket: 100_000,
      maxRetainedBytes: 100_000,
      maxRecordsPerGroup: 15,
      maxSpansPerRecord: 200,
      maxFetchesPerRecord: 200,
      maxBytesPerRecord: 64_000,
      maxBytesPerSpan: 8_000,
      maxEventsPerSpan: 16,
      maxLinksPerSpan: 8,
      maxSnapshotBytes: 10_000,
    },
    usage: {
      retainedRequestGroupCount: 200,
      retainedRequestCount: 200,
      retainedBytes: 1_000,
      buckets: [
        {
          bucket: 'api',
          retainedRequestGroupCount: 200,
          retainedRequestCount: 200,
          retainedBytes: 1_000,
          evictedRequestGroupCount: 1,
        },
      ],
    },
  }
}

function createRequest(omittedRequestCount: number): RequestInsight {
  return {
    requestId: 'request',
    htmlRequestId: 'request',
    source: 'page',
    startTime: 0,
    status: 'ok',
    spans: [],
    fetches: [],
    omittedRequestCount,
  }
}

describe('request insights capture usage', () => {
  it('shows the full bucket when it is the constraining limit', () => {
    expect(getCaptureUsagePresentation(createCaptureState())).toEqual({
      accessibleLabel: 'API group usage: 200 of 200',
      detail: 'API groups 200 of 200',
      max: 200,
      percentage: 100,
      value: 200,
    })
  })

  it('shows bytes when the global byte limit is more constrained', () => {
    const capture = createCaptureState()
    capture.usage.buckets[0].retainedRequestGroupCount = 1
    capture.usage.retainedBytes = 75_000

    expect(getCaptureUsagePresentation(capture)).toEqual({
      accessibleLabel: 'Total byte usage: 73.2 KiB of 97.7 KiB',
      detail: 'Total 73.2 KiB of 97.7 KiB',
      max: 100_000,
      percentage: 75,
      value: 75_000,
    })
  })

  it('shows per-bucket bytes when they are the constraining limit', () => {
    const capture = createCaptureState()
    capture.limits.maxBytesPerBucket = 10_000
    capture.usage.buckets[0].retainedRequestGroupCount = 1
    capture.usage.buckets[0].retainedBytes = 9_000
    capture.usage.retainedBytes = 9_000

    expect(getCaptureUsagePresentation(capture)).toEqual({
      accessibleLabel: 'API byte usage: 8.79 KiB of 9.77 KiB',
      detail: 'API bytes 8.79 KiB of 9.77 KiB',
      max: 10_000,
      percentage: 90,
      value: 9_000,
    })
  })

  it('does not show an omission notice when the complete capture is visible', () => {
    expect(getCaptureOmissionPresentation([], undefined)).toBeUndefined()
  })

  it('explains permanently omitted related requests', () => {
    expect(
      getCaptureOmissionPresentation([createRequest(1)], undefined)
    ).toEqual({
      accessibleLabel:
        "1 related request isn't shown because capture limits were reached.",
      detail:
        "1 related request isn't shown because capture limits were reached.",
    })
  })

  it('explains groups omitted only from the current projection', () => {
    expect(
      getCaptureOmissionPresentation([], {
        omittedRequestGroupCount: 2,
        buckets: [{ bucket: 'api', omittedRequestGroupCount: 2 }],
      })
    ).toEqual({
      accessibleLabel:
        "2 request groups aren't shown because capture limits were reached.",
      detail:
        "2 request groups aren't shown because capture limits were reached.",
    })
  })

  it('combines permanent and projection omissions in one accessible message', () => {
    expect(
      getCaptureOmissionPresentation([createRequest(3)], {
        omittedRequestGroupCount: 1,
        buckets: [{ bucket: 'page', omittedRequestGroupCount: 1 }],
      })
    ).toEqual({
      accessibleLabel:
        "1 request group and 3 related requests aren't shown because capture limits were reached.",
      detail:
        "1 request group and 3 related requests aren't shown because capture limits were reached.",
    })
  })
})
