/* eslint-disable jest/no-standalone-expect -- Assertions run inside the controller-scoped test wrapper. */

import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'

import { WebNextResponse } from '../../base-http/web'
import {
  RequestInsights,
  getRequestInsightsSnapshot,
  recordRequestInsightFetch,
  recordRequestInsightRouterActivity,
  recordRequestInsightServerAction,
  recordRequestInsightSource,
  subscribeRequestInsights,
} from './request-insights'
import { runWithRequestInsights } from './request-insights-runtime'
import { recordSpan } from './span-store'
import { getRequestInsightRouterActivity } from './request-insights-router-activity'
import {
  createRequestInsightsRetentionContext,
  isRequestInsightsRetentionContextOpen,
} from './request-insights-identity'
import {
  trackRequestInsightNodeResponse,
  trackRequestInsightWebResponse,
  type RequestInsightResponseLifecycle,
} from './request-insights-response'
import {
  createBoundedRequestInsightsSnapshotProjection,
  REQUEST_INSIGHTS_MAX_BYTES_PER_RETENTION_BUCKET,
  REQUEST_INSIGHTS_MAX_BYTES_PER_RECORD,
  REQUEST_INSIGHTS_MAX_BYTES_PER_SPAN,
  REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET,
  REQUEST_INSIGHTS_MAX_RETAINED_BYTES,
  REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES,
  getRequestInsightsSerializedByteLength,
  type RequestInsight,
  type RequestInsightsLiveSnapshot,
  type RequestInsightsLiveUpdate,
} from '../../../next-devtools/shared/request-insights'
import {
  createRequestInsightsByteLengthCache,
  updateRequestInsights,
} from '../../../next-devtools/dev-overlay/shared'
import { RequestInsightsHmrCoalescer } from '../dev-bundler-service'
import {
  isRequestInsightsHmrSocketActive,
  REQUEST_INSIGHTS_HMR_MAX_BUFFERED_BYTES,
  RequestInsightsHmrClientBuffer,
} from '../../dev/request-insights-hmr-backpressure'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type RequestInsightsUpdateMessage,
} from '../../dev/hot-reloader-types'

const originalRequestInsights = process.env.__NEXT_REQUEST_INSIGHTS
const originalDevServer = process.env.__NEXT_DEV_SERVER

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

function createLiveUpdate(
  sequence: number,
  overrides: Partial<RequestInsightsLiveUpdate> = {}
): RequestInsightsLiveUpdate {
  const capture: RequestInsightsLiveUpdate['capture'] = {
    limits: {
      maxRequestGroupsPerBucket: 200,
      maxBytesPerBucket: 18.75 * 1024 * 1024,
      maxRetainedBytes: 93.75 * 1024 * 1024,
      maxRecordsPerGroup: 15,
      maxSpansPerRecord: 200,
      maxFetchesPerRecord: 200,
      maxBytesPerRecord: 64 * 1024,
      maxBytesPerSpan: 8 * 1024,
      maxEventsPerSpan: 16,
      maxLinksPerSpan: 8,
      maxSnapshotBytes: 4 * 1024 * 1024,
    },
    usage: {
      retainedRequestGroupCount: 1,
      retainedRequestCount: 1,
      retainedBytes: 0,
      buckets: [],
    },
  }
  return {
    insight: {
      requestId: 'coalesced-root',
      rootRequestId: 'coalesced-root',
      source: 'page',
      htmlRequestId: 'coalesced-root',
      route: '/coalesced',
      startTime: sequence,
      status: 'ok',
      spans: [],
      fetches: [],
    },
    capture,
    generation: 0,
    sequence,
    retentionRevision: 0,
    ...overrides,
  }
}

function createLiveUpdateForRequest(
  requestId: string,
  sequence: number,
  startTime = sequence
): RequestInsightsLiveUpdate {
  const update = createLiveUpdate(sequence)
  return {
    ...update,
    insight: {
      ...update.insight,
      requestId,
      rootRequestId: requestId,
      htmlRequestId: requestId,
      route: `/${requestId.toLowerCase()}`,
      startTime,
    },
  }
}

function createLiveSnapshot(sequence: number): RequestInsightsLiveSnapshot {
  return {
    requests: [createLiveUpdate(sequence).insight],
    live: { generation: 0, sequence, retentionRevision: 0 },
  }
}

describe('request insights', () => {
  let requestInsights: RequestInsights

  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    requestInsights = new RequestInsights()
  })

  afterEach(() => {
    restoreEnv('__NEXT_REQUEST_INSIGHTS', originalRequestInsights)
    restoreEnv('__NEXT_DEV_SERVER', originalDevServer)
    requestInsights.dispose()
  })

  it('passes Request Insights HMR messages through while the client is writable', () => {
    const client = { bufferedAmount: 0, readyState: 1, send: jest.fn() }
    const buffer = new RequestInsightsHmrClientBuffer(client, () =>
      createLiveSnapshot(2)
    )
    const message: RequestInsightsUpdateMessage = {
      type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_UPDATE,
      ...createLiveUpdate(1),
    }

    buffer.send(message)

    expect(client.send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(client.send.mock.calls[0][0])).toEqual(message)
    buffer.close()
  })

  it('cleans up closed Request Insights HMR sockets', () => {
    expect(isRequestInsightsHmrSocketActive({ readyState: 0 })).toBe(true)
    expect(isRequestInsightsHmrSocketActive({ readyState: 1 })).toBe(true)
    expect(isRequestInsightsHmrSocketActive({ readyState: 2 })).toBe(false)
    expect(isRequestInsightsHmrSocketActive({ readyState: 3 })).toBe(false)

    const onClose = jest.fn()
    const client = { bufferedAmount: 0, readyState: 3, send: jest.fn() }
    const buffer = new RequestInsightsHmrClientBuffer(
      client,
      () => createLiveSnapshot(1),
      onClose
    )
    buffer.send({
      type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_UPDATE,
      ...createLiveUpdate(1),
    })
    buffer.close()

    expect(client.send).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('preserves initial snapshot authority while an HMR socket connects', () => {
    jest.useFakeTimers()
    try {
      let readyState = 0
      const client = {
        bufferedAmount: 0,
        get readyState() {
          return readyState
        },
        send: jest.fn(),
      }
      const snapshot = createLiveSnapshot(1)
      const buffer = new RequestInsightsHmrClientBuffer(client, () => snapshot)

      buffer.send({
        type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT,
        snapshot,
        authoritative: true,
      })
      expect(client.send).not.toHaveBeenCalled()

      readyState = 1
      jest.runOnlyPendingTimers()
      expect(JSON.parse(client.send.mock.calls[0][0])).toEqual({
        type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT,
        snapshot,
        authoritative: true,
      })
      buffer.close()
    } finally {
      jest.useRealTimers()
    }
  })

  it('cancels a pending Request Insights retry when the HMR client closes', () => {
    jest.useFakeTimers()
    try {
      const onClose = jest.fn()
      const client = {
        bufferedAmount: REQUEST_INSIGHTS_HMR_MAX_BUFFERED_BYTES,
        readyState: 1,
        send: jest.fn(),
      }
      const buffer = new RequestInsightsHmrClientBuffer(
        client,
        () => createLiveSnapshot(1),
        onClose
      )

      buffer.send({
        type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_UPDATE,
        ...createLiveUpdate(1),
      })
      expect(jest.getTimerCount()).toBe(1)

      buffer.close()
      expect(jest.getTimerCount()).toBe(0)
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(client.send).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('bounds 1000 stalled updates with one timer and the latest snapshot', () => {
    jest.useFakeTimers()
    try {
      let bufferedAmount = REQUEST_INSIGHTS_HMR_MAX_BUFFERED_BYTES
      let latestSequence = 1
      const client = {
        get bufferedAmount() {
          return bufferedAmount
        },
        readyState: 1,
        send: jest.fn(),
      }
      const getSnapshot = jest.fn(() => createLiveSnapshot(latestSequence))
      const buffer = new RequestInsightsHmrClientBuffer(client, getSnapshot)

      for (let sequence = 1; sequence <= 1_000; sequence++) {
        latestSequence = sequence
        buffer.send({
          type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_UPDATE,
          ...createLiveUpdate(sequence),
        })
      }
      expect(jest.getTimerCount()).toBe(1)
      expect(client.send).not.toHaveBeenCalled()

      bufferedAmount = 0
      jest.runOnlyPendingTimers()
      expect(getSnapshot).toHaveBeenCalledTimes(1)
      expect(JSON.parse(client.send.mock.calls[0][0])).toEqual({
        type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT,
        snapshot: createLiveSnapshot(1_000),
      })
      expect(jest.getTimerCount()).toBe(0)
      buffer.close()
    } finally {
      jest.useRealTimers()
    }
  })

  it('reuses serialized live snapshot envelopes between HMR clients', () => {
    const snapshot = createLiveSnapshot(2)
    const firstClient = { bufferedAmount: 0, readyState: 1, send: jest.fn() }
    const secondClient = { bufferedAmount: 0, readyState: 1, send: jest.fn() }
    const first = new RequestInsightsHmrClientBuffer(
      firstClient,
      () => snapshot
    )
    const second = new RequestInsightsHmrClientBuffer(
      secondClient,
      () => snapshot
    )
    const stringify = jest.spyOn(JSON, 'stringify')
    try {
      const message = {
        type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT,
        snapshot,
      } as const
      first.send(message)
      second.send(message)
      expect(stringify).toHaveBeenCalledTimes(1)
      expect(secondClient.send).toHaveBeenCalledWith(
        firstClient.send.mock.calls[0][0]
      )
    } finally {
      stringify.mockRestore()
      first.close()
      second.close()
    }
  })

  it('coalesces record updates and replaces retention changes with a snapshot', () => {
    jest.useFakeTimers()
    try {
      const sendUpdate = jest.fn()
      const sendSnapshot = jest.fn()
      const getSnapshot = jest.fn(() => createLiveSnapshot(201))
      const coalescer = new RequestInsightsHmrCoalescer(
        sendUpdate,
        sendSnapshot,
        getSnapshot
      )

      for (let sequence = 1; sequence <= 200; sequence++) {
        coalescer.enqueue(createLiveUpdate(sequence))
      }
      jest.runOnlyPendingTimers()
      expect(sendUpdate).toHaveBeenCalledTimes(1)
      expect(sendUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ sequence: 200 })
      )
      expect(sendSnapshot).not.toHaveBeenCalled()

      coalescer.enqueue(
        createLiveUpdate(201, {
          retentionRevision: 1,
          requiresResync: true,
        })
      )
      jest.runOnlyPendingTimers()
      expect(sendSnapshot).toHaveBeenCalledWith(createLiveSnapshot(201), false)

      coalescer.requestResync(true)
      jest.runOnlyPendingTimers()
      expect(sendSnapshot).toHaveBeenCalledTimes(2)
      expect(sendSnapshot).toHaveBeenLastCalledWith(
        createLiveSnapshot(201),
        true
      )
      coalescer.close()
    } finally {
      jest.useRealTimers()
    }
  })

  it('coalesces a burst of resync requests into one live snapshot', () => {
    jest.useFakeTimers()
    try {
      const sendSnapshot = jest.fn()
      const getSnapshot = jest.fn(() => createLiveSnapshot(3))
      const coalescer = new RequestInsightsHmrCoalescer(
        jest.fn(),
        sendSnapshot,
        getSnapshot
      )

      coalescer.requestResync()
      coalescer.requestResync(true)
      coalescer.requestResync()
      expect(jest.getTimerCount()).toBe(1)

      jest.runOnlyPendingTimers()
      expect(getSnapshot).toHaveBeenCalledTimes(1)
      expect(sendSnapshot).toHaveBeenCalledTimes(1)
      expect(sendSnapshot).toHaveBeenCalledWith(createLiveSnapshot(3), true)
      coalescer.close()
    } finally {
      jest.useRealTimers()
    }
  })

  it('resyncs when coalescing would reorder newly discovered records', () => {
    jest.useFakeTimers()
    try {
      const firstA = createLiveUpdateForRequest('A', 1, 1)
      const firstB = createLiveUpdateForRequest('B', 2, 2)
      const latestA = createLiveUpdateForRequest('A', 3, 1)
      latestA.insight.durationMs = 3
      const serverSnapshot: RequestInsightsLiveSnapshot = {
        requests: [latestA.insight, firstB.insight],
        live: { generation: 0, sequence: 3, retentionRevision: 0 },
      }
      let clientRequests: readonly RequestInsight[] = []
      let clientByteLengths = createRequestInsightsByteLengthCache([])
      const sendUpdate = jest.fn((update: RequestInsightsLiveUpdate) => {
        const next = updateRequestInsights(
          clientRequests,
          clientByteLengths,
          update.insight,
          update.capture
        )
        clientRequests = next.requests
        clientByteLengths = next.byteLengths
      })
      const sendSnapshot = jest.fn((snapshot: RequestInsightsLiveSnapshot) => {
        clientRequests = snapshot.requests
        clientByteLengths = createRequestInsightsByteLengthCache(
          snapshot.requests
        )
      })
      const coalescer = new RequestInsightsHmrCoalescer(
        sendUpdate,
        sendSnapshot,
        () => serverSnapshot
      )

      coalescer.enqueue(firstA)
      coalescer.enqueue(firstB)
      coalescer.enqueue(latestA)
      jest.runOnlyPendingTimers()

      expect(sendUpdate).not.toHaveBeenCalled()
      expect(sendSnapshot).toHaveBeenCalledWith(serverSnapshot, false)
      expect(clientRequests.map((request) => request.requestId)).toEqual([
        'A',
        'B',
      ])

      const projectedServerOrder =
        createBoundedRequestInsightsSnapshotProjection(
          serverSnapshot.requests.map((request) => [request]),
          REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES,
          undefined,
          1
        ).snapshot.requests
      const projectedClientOrder =
        createBoundedRequestInsightsSnapshotProjection(
          clientRequests.map((request) => [request]),
          REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES,
          undefined,
          1
        ).snapshot.requests
      expect(projectedClientOrder).toEqual(projectedServerOrder)
      expect(projectedClientOrder.map((request) => request.requestId)).toEqual([
        'B',
      ])

      const nextC = createLiveUpdateForRequest('C', 4, 4)
      nextC.capture.limits.maxRequestGroupsPerBucket = 2
      nextC.capture.usage.buckets = [
        {
          bucket: 'page',
          retainedRequestGroupCount: 2,
          retainedRequestCount: 2,
          retainedBytes: 0,
          evictedRequestGroupCount: 1,
        },
      ]
      coalescer.enqueue(nextC)
      jest.runOnlyPendingTimers()
      expect(clientRequests.map((request) => request.requestId)).toEqual([
        'B',
        'C',
      ])
      coalescer.close()
    } finally {
      jest.useRealTimers()
    }
  })

  it('resyncs when an update was omitted from the published projection', () => {
    jest.useFakeTimers()
    const controller = new RequestInsights({ maxSnapshotBytes: 3_500 })
    let unsubscribe = () => {}
    try {
      for (let index = 0; index < 12; index++) {
        controller.recordSpan({
          name: `old-${index}-${'x'.repeat(200)}`,
          timestamp: index,
          requestId: 'A',
          rootRequestId: 'A',
          requestInsightSource: 'page',
        })
      }
      controller.recordFetch(
        { requestId: 'B', rootRequestId: 'B', source: 'page' },
        { url: '/new', startTime: 20, durationMs: 1 }
      )

      const authoritativeSnapshot = controller.getLiveSnapshot()
      expect(
        authoritativeSnapshot.requests.map((request) => request.requestId)
      ).toEqual(['B'])
      let clientRequests = authoritativeSnapshot.requests
      let clientByteLengths =
        createRequestInsightsByteLengthCache(clientRequests)
      const sendUpdate = jest.fn((update: RequestInsightsLiveUpdate) => {
        const next = updateRequestInsights(
          clientRequests,
          clientByteLengths,
          update.insight,
          update.capture
        )
        clientRequests = next.requests
        clientByteLengths = next.byteLengths
      })
      const sendSnapshot = jest.fn((snapshot: RequestInsightsLiveSnapshot) => {
        clientRequests = snapshot.requests
        clientByteLengths = createRequestInsightsByteLengthCache(
          snapshot.requests
        )
      })
      const coalescer = new RequestInsightsHmrCoalescer(
        sendUpdate,
        sendSnapshot,
        () => controller.getLiveSnapshot()
      )
      unsubscribe = controller.subscribeLive((update) =>
        coalescer.enqueue(update)
      )

      controller.recordFetch(
        { requestId: 'A', rootRequestId: 'A', source: 'page' },
        { url: '/old-update', startTime: 21, durationMs: 1 }
      )
      jest.runOnlyPendingTimers()

      const serverSnapshot = controller.getLiveSnapshot()
      expect(sendUpdate).not.toHaveBeenCalled()
      expect(sendSnapshot).toHaveBeenCalledTimes(1)
      expect(clientRequests).toEqual(serverSnapshot.requests)
      expect(clientRequests.map((request) => request.requestId)).toEqual(['B'])
      coalescer.close()
    } finally {
      unsubscribe()
      controller.dispose()
      jest.useRealTimers()
    }
  })

  it('resyncs a late update to a root omitted by an incremental growth update', () => {
    const controller = new RequestInsights({ maxSnapshotBytes: 3_500 })
    try {
      controller.recordFetch(
        { requestId: 'A', rootRequestId: 'A', source: 'page' },
        { url: `/old/${'a'.repeat(500)}`, startTime: 1, durationMs: 1 }
      )
      controller.recordFetch(
        { requestId: 'B', rootRequestId: 'B', source: 'page' },
        { url: '/new', startTime: 2, durationMs: 1 }
      )
      expect(
        controller
          .getLiveSnapshot()
          .requests.map((request) => request.requestId)
      ).toEqual(['A', 'B'])

      const updates: RequestInsightsLiveUpdate[] = []
      const unsubscribe = controller.subscribeLive((update) =>
        updates.push(update)
      )
      for (let index = 0; index < 8; index++) {
        controller.recordSpan({
          name: `grow-${index}-${'x'.repeat(200)}`,
          timestamp: 3 + index,
          requestId: 'B',
          rootRequestId: 'B',
          requestInsightSource: 'page',
        })
      }
      expect(
        controller.getSnapshot().requests.map((request) => request.requestId)
      ).toEqual(['B'])
      expect(updates.some((update) => update.requiresResync)).toBe(false)

      updates.length = 0
      controller.recordFetch(
        { requestId: 'A', rootRequestId: 'A', source: 'page' },
        { url: '/old-late-update', startTime: 20, durationMs: 1 }
      )
      expect(updates.at(-1)?.requiresResync).toBe(true)
      expect(
        controller
          .getLiveSnapshot()
          .requests.map((request) => request.requestId)
      ).toEqual(['B'])
      unsubscribe()
    } finally {
      controller.dispose()
    }
  })

  it('resyncs when a shrinking root makes an omitted root projectable', () => {
    const controller = new RequestInsights({ maxSnapshotBytes: 50_000 })
    try {
      for (let index = 0; index < 20; index++) {
        controller.recordSpan({
          name: `old-${index}-${'a'.repeat(300)}`,
          timestamp: index,
          requestId: 'A',
          rootRequestId: 'A',
          requestInsightSource: 'page',
        })
      }
      for (let index = 0; index < 100; index++) {
        controller.recordSpan({
          name: `large-${index}-${'b'.repeat(400)}`,
          timestamp: 100 + index,
          requestId: 'B',
          rootRequestId: 'B',
          requestInsightSource: 'page',
        })
      }
      expect(
        controller
          .getLiveSnapshot()
          .requests.map((request) => request.requestId)
      ).toEqual(['B'])

      const updates: RequestInsightsLiveUpdate[] = []
      const unsubscribe = controller.subscribeLive((update) =>
        updates.push(update)
      )
      for (let index = 0; index < 200; index++) {
        controller.recordSpan({
          name: `small-${index}`,
          timestamp: 300 + index,
          requestId: 'B',
          rootRequestId: 'B',
          requestInsightSource: 'page',
        })
      }

      expect(
        controller.getSnapshot().requests.map((request) => request.requestId)
      ).toEqual(['A', 'B'])
      expect(updates.some((update) => update.requiresResync)).toBe(true)
      unsubscribe()
    } finally {
      controller.dispose()
    }
  })

  it('keeps a new root incremental after an initial live snapshot', () => {
    const controller = new RequestInsights()
    try {
      expect(controller.getLiveSnapshot().requests).toEqual([])
      const listener = jest.fn()
      const unsubscribe = controller.subscribeLive(listener)

      controller.recordFetch(
        { requestId: 'new', rootRequestId: 'new', source: 'page' },
        { url: '/new', startTime: 1, durationMs: 1 }
      )

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener.mock.calls[0][0].requiresResync).toBeUndefined()
      unsubscribe()
    } finally {
      controller.dispose()
    }
  })

  it('keeps live snapshot identity stable until capture changes', () => {
    const initial = requestInsights.getLiveSnapshot()
    expect(requestInsights.getLiveSnapshot()).toBe(initial)

    requestInsights.recordFetch(
      { requestId: 'live', rootRequestId: 'live', source: 'page' },
      { url: '/live', startTime: 1 }
    )
    const changed = requestInsights.getLiveSnapshot()
    expect(changed).not.toBe(initial)
    expect(requestInsights.getLiveSnapshot()).toBe(changed)

    requestInsights.clear()
    const cleared = requestInsights.getLiveSnapshot()
    expect(cleared.live.generation).toBeGreaterThan(changed.live.generation)
    expect(cleared.requests).toEqual([])
  })

  it('keeps updates incremental before a live projection is published', () => {
    const listener = jest.fn()
    const unsubscribe = requestInsights.subscribeLive(listener)

    requestInsights.recordFetch(
      { requestId: 'unpublished', source: 'page' },
      { url: '/unpublished', startTime: 1 }
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].requiresResync).toBeUndefined()
    unsubscribe()
  })

  it('requests live resync after capture configuration, trimming, and clear', () => {
    const resync = jest.fn()
    const unsubscribe = requestInsights.subscribeResync(resync)

    requestInsights.setMaxRequestGroupsPerBucket(1)
    expect(resync).toHaveBeenCalledTimes(1)

    requestInsights.recordFetch(
      { requestId: 'first', rootRequestId: 'first', source: 'page' },
      { url: '/first', startTime: 1 }
    )
    requestInsights.recordFetch(
      { requestId: 'second', rootRequestId: 'second', source: 'page' },
      { url: '/second', startTime: 2 }
    )
    expect(resync).toHaveBeenCalledTimes(2)

    requestInsights.clear()
    expect(resync).toHaveBeenCalledTimes(3)
    expect(resync).toHaveBeenLastCalledWith(true)
    unsubscribe()
  })

  it('only builds compatibility snapshots for compatibility subscribers', () => {
    const getSnapshot = jest.spyOn(requestInsights, 'getSnapshot')
    const resync = jest.fn()
    const unsubscribeResync = requestInsights.subscribeResync(resync)
    let unsubscribeSnapshot: (() => void) | undefined
    try {
      requestInsights.setMaxRequestGroupsPerBucket(1)
      expect(resync).toHaveBeenCalledTimes(1)
      expect(getSnapshot).not.toHaveBeenCalled()

      const legacySnapshot = jest.fn()
      unsubscribeSnapshot = requestInsights.subscribeSnapshots(legacySnapshot)
      requestInsights.setMaxRequestGroupsPerBucket(2)
      expect(getSnapshot).toHaveBeenCalledTimes(1)
      expect(legacySnapshot).toHaveBeenCalledTimes(1)
    } finally {
      unsubscribeSnapshot?.()
      unsubscribeResync()
      getSnapshot.mockRestore()
    }
  })

  function withRequestInsights<TArgs extends unknown[]>(
    fn: (...args: TArgs) => void
  ): (...args: TArgs) => void {
    return (...args) => {
      runWithRequestInsights(requestInsights, () => fn(...args))
    }
  }

  function test(name: string, fn: () => void): void {
    it(name, withRequestInsights(fn))
  }

  it('isolates retained data by active controller', () => {
    const first = new RequestInsights()
    const second = new RequestInsights()
    try {
      runWithRequestInsights(first, () => {
        recordRequestInsightFetch(
          { requestId: 'first' },
          { url: '/first', startTime: 1, durationMs: 1 }
        )
        runWithRequestInsights(second, () => {
          recordRequestInsightFetch(
            { requestId: 'second' },
            { url: '/second', startTime: 2, durationMs: 1 }
          )
        })
        runWithRequestInsights(undefined, () => {
          recordRequestInsightFetch(
            { requestId: 'disabled' },
            { url: '/disabled', startTime: 3, durationMs: 1 }
          )
        })
      })

      expect(
        first.getSnapshot().requests.map(({ requestId }) => requestId)
      ).toEqual(['first'])
      expect(
        second.getSnapshot().requests.map(({ requestId }) => requestId)
      ).toEqual(['second'])
    } finally {
      first.dispose()
      second.dispose()
    }
  })

  test('derives request history from local span records', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordSpan({
      name: 'render route (app) /products/[id]',
      startTime: 100,
      durationMs: 50,
      status: 'ok',
      traceId: 'trace_1',
      spanId: 'span_1',
      requestId: 'req_1',
      htmlRequestId: 'html_1',
      route: '/products/[id]',
      attributes: {
        'next.span_category': 'nextjs',
        'next.span_type': 'AppRender.getBodyResult',
      },
      events: [
        {
          name: 'metadata ready',
          timestamp: 130,
        },
      ],
      links: [
        {
          traceId: 'linked_trace',
          spanId: 'linked_span',
        },
      ],
    })

    recordSpan({
      name: 'fetch GET https://example.vercel.sh/',
      startTime: 120,
      durationMs: 25,
      status: 'ok',
      requestId: 'req_1',
      htmlRequestId: 'html_1',
      route: '/products/[id]',
      attributes: {
        'next.span_category': 'application',
        'next.span_type': 'AppRender.fetch',
        'http.url': 'https://example.vercel.sh/',
        'http.method': 'GET',
        'http.status_code': 200,
        'next.fetch.idx': 1,
        'next.fetch.cache_status': 'skip',
        'next.fetch.cache_reason': 'cache: no-store',
      },
    })

    expect(getRequestInsightsSnapshot()).toEqual(
      expect.objectContaining({
        requests: [
          expect.objectContaining({
            requestId: 'req_1',
            htmlRequestId: 'html_1',
            route: '/products/[id]',
            durationMs: 50,
            status: 'ok',
            spans: expect.arrayContaining([
              expect.objectContaining({
                name: 'fetch GET https://example.vercel.sh/',
                attributes: expect.objectContaining({
                  'next.span_category': 'application',
                }),
              }),
              expect.objectContaining({
                traceId: 'trace_1',
                spanId: 'span_1',
                attributes: expect.objectContaining({
                  'next.span_category': 'nextjs',
                }),
                events: [
                  {
                    name: 'metadata ready',
                    timestamp: 130,
                  },
                ],
                links: [
                  {
                    traceId: 'linked_trace',
                    spanId: 'linked_span',
                  },
                ],
              }),
            ]),
            fetches: [
              {
                url: 'https://example.vercel.sh/',
                method: 'GET',
                statusCode: 200,
                startTime: 120,
                durationMs: 25,
                cacheStatus: 'skip',
                cacheReason: 'cache: no-store',
                index: 1,
              },
            ],
          }),
        ],
      })
    )
  })

  test('notifies subscribers when a request insight changes', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const listener = jest.fn()
    const unsubscribe = subscribeRequestInsights(listener)

    recordSpan({
      name: 'render route (app) /dashboard',
      requestId: 'req_2',
      htmlRequestId: 'html_2',
      route: '/dashboard',
    })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_2',
        htmlRequestId: 'html_2',
        route: '/dashboard',
      }),
      expect.objectContaining({
        limits: expect.objectContaining({ maxRequestGroupsPerBucket: 200 }),
      })
    )

    unsubscribe()
  })

  it('isolates capture state passed to each subscriber', () => {
    const controller = new RequestInsights()
    const secondListener = jest.fn()
    controller.subscribe((_insight, capture) => {
      capture.limits.maxRequestGroupsPerBucket = 1
      capture.usage.buckets[0].retainedRequestCount = 999
    })
    controller.subscribe(secondListener)

    try {
      controller.recordFetch(
        { requestId: 'listener', source: 'page' },
        { url: '/listener', startTime: 1 }
      )

      expect(secondListener).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          limits: expect.objectContaining({ maxRequestGroupsPerBucket: 200 }),
          usage: expect.objectContaining({
            buckets: expect.arrayContaining([
              expect.objectContaining({
                bucket: 'page',
                retainedRequestCount: 1,
              }),
            ]),
          }),
        })
      )
      expect(
        controller.getCaptureState().limits.maxRequestGroupsPerBucket
      ).toBe(200)
    } finally {
      controller.dispose()
    }
  })

  test('uses the HTTP request span as the end-to-end request timing', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordSpan({
      name: 'render route (app) /dashboard',
      requestId: 'req_timing',
      startTime: 100,
      durationMs: 60,
    })
    recordSpan({
      name: 'GET /dashboard',
      requestId: 'req_timing',
      startTime: 100,
      durationMs: 50,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    recordRequestInsightFetch(
      { requestId: 'req_timing' },
      { url: 'https://example.com/late', startTime: 145, durationMs: 20 }
    )

    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        startTime: 100,
        durationMs: 50,
      })
    )
  })

  test('classifies framework request sources without letting the root span erase a specific source', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordSpan({
      name: 'run app route',
      requestId: 'req_source',
      attributes: {
        'next.span_type': 'AppRouteRouteHandlers.runHandler',
      },
    })
    recordSpan({
      name: 'GET /api/items',
      requestId: 'req_source',
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })

    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({ source: 'app-route' })
    )
  })

  it.each([
    ['Node.runHandler', 'pages-api'],
    ['NextNodeServer.imageOptimizer', 'image'],
    ['Middleware.execute', 'proxy'],
  ] as const)(
    'classifies %s spans as %s requests',
    withRequestInsights((spanType, source) => {
      process.env.__NEXT_REQUEST_INSIGHTS = 'true'

      recordSpan({
        name: spanType,
        requestId: `req_${source}`,
        attributes: {
          'next.span_type': spanType,
        },
      })

      expect(getRequestInsightsSnapshot().requests[0]).toEqual(
        expect.objectContaining({ source })
      )
    })
  )

  test('records an authoritative static asset source after tracing starts', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity: Parameters<typeof recordRequestInsightSource>[0] = {
      requestId: 'req_asset',
    }

    recordSpan({
      name: 'GET /asset.svg',
      requestId: identity.requestId,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    recordRequestInsightSource(identity, 'asset')

    expect(identity.source).toBe('asset')
    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({ source: 'asset' })
    )
  })

  test('does not create a request only because a source was recorded', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordRequestInsightSource({ requestId: 'untraced-asset' }, 'asset')

    expect(getRequestInsightsSnapshot().requests).toEqual([])
  })

  test('does not classify the middleware pass as a page before an App Route runs', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity = {
      requestId: 'middleware-app-route',
      source: 'proxy' as const,
    }

    recordSpan({
      name: 'proxy POST /api/stream',
      requestId: identity.requestId,
      requestInsightSource: identity.source,
      startTime: 1,
      attributes: {
        'next.span_type': 'Middleware.execute',
      },
    })
    recordSpan({
      name: 'POST /api/stream',
      requestId: identity.requestId,
      requestInsightSource: identity.source,
      startTime: 2,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })

    expect(getRequestInsightsSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: identity.requestId,
        source: 'proxy',
      }),
    ])

    recordRequestInsightSource(identity, 'app-route')
    recordSpan({
      name: 'execute route handler',
      requestId: identity.requestId,
      startTime: 3,
      attributes: {
        'next.span_type': 'AppRouteRouteHandlers.runHandler',
      },
    })

    const requests = getRequestInsightsSnapshot().requests
    expect(requests).toHaveLength(1)
    expect(requests[0]).toEqual(
      expect.objectContaining({
        requestId: identity.requestId,
        source: 'app-route',
      })
    )
    expect(
      requests[0].spans.map((span) => span.attributes?.['next.span_type'])
    ).toEqual([
      'Middleware.execute',
      'BaseServer.handleRequest',
      'AppRouteRouteHandlers.runHandler',
    ])
  })

  test('classifies the route pass as a page after middleware completes', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity = {
      requestId: 'middleware-page',
      source: 'proxy' as 'proxy' | undefined,
    }

    recordSpan({
      name: 'proxy GET /products',
      requestId: identity.requestId,
      requestInsightSource: identity.source,
      startTime: 1,
      attributes: {
        'next.span_type': 'Middleware.execute',
      },
    })
    recordSpan({
      name: 'GET /products',
      requestId: identity.requestId,
      requestInsightSource: identity.source,
      startTime: 2,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    identity.source = undefined
    recordSpan({
      name: 'GET /products',
      requestId: identity.requestId,
      requestInsightSource: identity.source,
      startTime: 3,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })

    expect(getRequestInsightsSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: identity.requestId,
        source: 'page',
      }),
    ])
  })

  test('records normalized router activity and confirmed Server Actions', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity = { requestId: 'req_activity' }

    recordSpan({
      name: 'render route (app) /dashboard',
      requestId: identity.requestId,
    })

    recordRequestInsightRouterActivity(identity, 'segment-prefetch')
    recordRequestInsightServerAction(identity)

    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        source: 'unknown',
        routerActivity: 'segment-prefetch',
        serverAction: true,
      })
    )
  })

  test('derives router activity only from valid RSC protocol headers', () => {
    expect(
      getRequestInsightRouterActivity({
        rsc: '1',
        'next-router-prefetch': '1',
        'next-router-segment-prefetch': '/dashboard',
      })
    ).toBe('segment-prefetch')
    expect(
      getRequestInsightRouterActivity({
        'next-router-prefetch': '1',
      })
    ).toBeUndefined()
    expect(
      getRequestInsightRouterActivity({
        rsc: '1',
        'next-hmr-refresh': '1',
      })
    ).toBe('hmr-refresh')
  })

  test('keeps request and Instant Insights data separate for the same request ID', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const listener = jest.fn()
    const unsubscribe = subscribeRequestInsights(listener)

    recordSpan({
      name: 'GET /dashboard',
      requestId: 'req_shared',
      htmlRequestId: 'html_shared',
      route: '/dashboard',
      startTime: 100,
      durationMs: 40,
      status: 'ok',
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    recordSpan({
      name: 'Instant Insights',
      requestId: 'req_shared',
      requestInsightKind: 'instant-insights',
      htmlRequestId: 'html_shared',
      route: '/dashboard',
      startTime: 150,
      durationMs: 75,
      status: 'ok',
      attributes: {
        'next.span_type': 'AppRender.instantInsights',
      },
    })
    recordRequestInsightFetch(
      {
        requestId: 'req_shared',
        kind: 'instant-insights',
        htmlRequestId: 'html_shared',
        route: '/dashboard',
      },
      {
        url: 'https://example.com/validation-data',
        startTime: 175,
        durationMs: 10,
      }
    )

    expect(getRequestInsightsSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: 'req_shared',
        kind: 'request',
        startTime: 100,
        durationMs: 40,
        fetches: [],
      }),
      expect.objectContaining({
        requestId: 'req_shared',
        kind: 'instant-insights',
        startTime: 150,
        durationMs: 75,
        fetches: [
          expect.objectContaining({
            url: 'https://example.com/validation-data',
          }),
        ],
      }),
    ])
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'request' }),
      expect.any(Object)
    )
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'instant-insights' }),
      expect.any(Object)
    )

    unsubscribe()
  })

  test('does not treat aggregate client component loading as a trace span', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordSpan({
      name: 'NextNodeServer.clientComponentLoading',
      requestId: 'req_client_loading',
      startTime: 100,
      durationMs: 50,
      attributes: {
        'next.span_type': 'NextNodeServer.clientComponentLoading',
      },
    })

    expect(getRequestInsightsSnapshot().requests).toEqual([])
  })

  test('records request fetch metrics when the OTel fetch span does not complete locally', () => {
    recordRequestInsightFetch(
      {
        requestId: 'req_3',
        htmlRequestId: 'html_3',
        route: '/reports',
      },
      {
        url: 'https://example.vercel.sh/api',
        method: 'GET',
        statusCode: 200,
        startTime: 200,
        durationMs: 75,
        cacheStatus: 'miss',
        index: 1,
      }
    )

    expect(getRequestInsightsSnapshot()).toEqual(
      expect.objectContaining({
        requests: [
          expect.objectContaining({
            requestId: 'req_3',
            htmlRequestId: 'html_3',
            route: '/reports',
            durationMs: 75,
            fetches: [
              expect.objectContaining({
                url: 'https://example.vercel.sh/api',
                startTime: 200,
                durationMs: 75,
                cacheStatus: 'miss',
              }),
            ],
          }),
        ],
      })
    )
  })

  test('redacts sensitive request insight payload fields', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    const secret = 'Q2_SECRET_SENTINEL'
    recordSpan({
      name: `fetch GET https://example.vercel.sh/api?token=${secret}`,
      startTime: 100,
      durationMs: 10,
      requestId: 'req_4',
      route: '/account',
      attributes: {
        'next.span_type': 'AppRender.fetch',
        'http.url': `https://user:pass@example.vercel.sh/api?access_token=${secret}&delay=1&signature=sig`,
        'http.method': 'GET',
        'next.span_name': `fetch GET https://user:pass@example.vercel.sh/api?access_token=${secret}`,
        'custom.secret': 'should not be exposed',
      },
      events: [
        {
          name: 'fetch start',
          timestamp: 100,
          attributes: {
            'next.span_type': 'AppRender.fetch',
            'custom.secret': 'should not be exposed',
          },
        },
      ],
      links: [
        {
          traceId: 'linked_trace',
          spanId: 'linked_span',
          attributes: {
            'custom.secret': 'should not be exposed',
          },
        },
      ],
    })

    recordRequestInsightFetch(
      {
        requestId: 'req_4',
        route: '/account',
      },
      {
        url: 'https://example.vercel.sh/api?token=abc&keep=1',
        startTime: 120,
        durationMs: 5,
      }
    )

    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        spans: [
          expect.objectContaining({
            name: 'fetch GET https://example.vercel.sh/api?query=redacted',
            attributes: {
              'next.span_type': 'AppRender.fetch',
              'http.url': 'https://example.vercel.sh/api?query=redacted',
              'http.method': 'GET',
              'next.span_name':
                'fetch GET https://example.vercel.sh/api?query=redacted',
            },
            events: [
              {
                name: 'fetch start',
                timestamp: 100,
                attributes: {
                  'next.span_type': 'AppRender.fetch',
                },
              },
            ],
            links: [
              {
                traceId: 'linked_trace',
                spanId: 'linked_span',
                attributes: undefined,
              },
            ],
          }),
        ],
        fetches: [
          expect.objectContaining({
            url: 'https://example.vercel.sh/api?query=redacted',
          }),
          expect.objectContaining({
            url: 'https://example.vercel.sh/api?query=redacted',
          }),
        ],
      })
    )
    expect(JSON.stringify(getRequestInsightsSnapshot())).not.toContain(secret)
  })

  test('only exposes bounded URLs without query payloads', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    const cases = [
      {
        requestId: 'relative',
        input: '/products/blue?sort=price#details',
        expected: '/products/blue?query=redacted',
      },
      {
        requestId: 'protocol-relative',
        input: '//example.com/items?cursor=secret',
        expected: '//example.com/items?query=redacted',
      },
      {
        requestId: 'absolute',
        input: 'https://user:password@example.com/items?visible=value#details',
        expected: 'https://example.com/items?query=redacted',
      },
      {
        requestId: 'opaque',
        input: 'data:text/plain,secret',
        expected: 'data:redacted',
      },
      {
        requestId: 'untrusted-relative',
        input: 'items?token=secret',
        expected: undefined,
      },
    ] as const

    for (const testCase of cases) {
      recordRequestInsightFetch(
        { requestId: testCase.requestId },
        { url: testCase.input, startTime: 100, durationMs: 1 }
      )
    }

    const requests = new Map(
      getRequestInsightsSnapshot().requests.map((request) => [
        request.requestId,
        request,
      ])
    )
    for (const testCase of cases) {
      expect(requests.get(testCase.requestId)?.fetches[0]?.url).toBe(
        testCase.expected
      )
    }

    recordRequestInsightFetch(
      { requestId: 'oversized' },
      {
        url: `https://example.com/${'x'.repeat(64 * 1024)}`,
        startTime: 100,
        durationMs: 1,
      }
    )
    expect(
      getRequestInsightsSnapshot().requests.find(
        (request) => request.requestId === 'oversized'
      )?.fetches[0]?.url
    ).toBeUndefined()

    recordRequestInsightFetch(
      { requestId: 'query-name' },
      {
        url: 'https://example.com/items?sk_live_SENTINEL',
        startTime: 100,
        durationMs: 1,
      }
    )
    expect(
      JSON.stringify(
        getRequestInsightsSnapshot().requests.find(
          (request) => request.requestId === 'query-name'
        )
      )
    ).not.toContain('sk_live_SENTINEL')
  })

  it('retains independent newest suffixes for each fixed request bucket', () => {
    const controller = new RequestInsights({ maxRequestGroupsPerBucket: 2 })
    try {
      for (const [source, prefix] of [
        ['page', 'page'],
        ['app-route', 'api'],
        ['asset', 'asset'],
        ['proxy', 'proxy'],
        ['instant-insights', 'instant'],
        ['unknown', 'unknown'],
      ] as const) {
        for (let index = 0; index < 3; index++) {
          controller.recordFetch(
            {
              requestId: `${prefix}-${index}`,
              rootRequestId: `${prefix}-${index}`,
              source,
              kind:
                source === 'instant-insights' ? 'instant-insights' : 'request',
            },
            { url: `/${prefix}/${index}`, startTime: index, durationMs: 1 }
          )
        }
      }

      const capture = controller.getCaptureState()
      expect(capture.usage.retainedRequestGroupCount).toBe(12)
      for (const bucket of capture.usage.buckets) {
        expect(bucket).toEqual(
          expect.objectContaining({
            retainedRequestGroupCount: 2,
            evictedRequestGroupCount: 1,
          })
        )
      }
      expect(
        controller.getSnapshot().requests.map((request) => request.requestId)
      ).not.toContain('page-0')
      expect(
        controller.getSnapshot().requests.map((request) => request.requestId)
      ).toContain('page-2')
    } finally {
      controller.dispose()
    }
  })

  it('enforces per-bucket and aggregate retained byte ceilings', () => {
    const perBucket = new RequestInsights({
      maxBytesPerRetentionBucket: 1_200,
      maxRetainedBytes: 100_000,
    })
    const aggregate = new RequestInsights({
      maxBytesPerRetentionBucket: 100_000,
      maxRetainedBytes: 1_500,
    })
    try {
      for (let index = 0; index < 10; index++) {
        perBucket.recordSpan({
          name: `page-${index}-${'x'.repeat(400)}`,
          timestamp: index,
          requestId: `page-${index}`,
          rootRequestId: `page-${index}`,
          requestInsightSource: 'page',
        })
      }
      const pageUsage = perBucket
        .getCaptureState()
        .usage.buckets.find((bucket) => bucket.bucket === 'page')!
      expect(pageUsage.retainedBytes).toBeLessThanOrEqual(1_200)
      expect(pageUsage.evictedRequestGroupCount).toBeGreaterThan(0)

      for (let index = 0; index < 10; index++) {
        aggregate.recordSpan({
          name: `${'x'.repeat(300)}-${index}`,
          timestamp: index,
          requestId: `global-${index}`,
          rootRequestId: `global-${index}`,
          requestInsightSource: index % 2 === 0 ? 'page' : 'app-route',
        })
      }
      const aggregateCapture = aggregate.getCaptureState()
      expect(aggregateCapture.usage.retainedBytes).toBeLessThanOrEqual(1_500)
      expect(
        aggregateCapture.usage.buckets.reduce(
          (total, bucket) => total + bucket.evictedRequestGroupCount,
          0
        )
      ).toBeGreaterThan(0)
    } finally {
      perBucket.dispose()
      aggregate.dispose()
    }
  })

  it('reports retained bytes from the serialized record payloads', () => {
    const controller = new RequestInsights()
    try {
      controller.recordSpan({
        name: 'page span',
        timestamp: 1,
        requestId: 'page-bytes',
        rootRequestId: 'page-bytes',
        requestInsightSource: 'page',
      })
      controller.recordSpan({
        name: 'api span',
        timestamp: 2,
        requestId: 'api-bytes',
        rootRequestId: 'api-bytes',
        requestInsightSource: 'app-route',
      })

      const snapshot = controller.getSnapshot()
      const expectedBytes = snapshot.requests.reduce(
        (total, request) =>
          total + Buffer.byteLength(JSON.stringify(request), 'utf8'),
        0
      )
      expect(snapshot.capture?.usage.retainedBytes).toBe(expectedBytes)
      expect(
        snapshot.capture?.usage.buckets.reduce(
          (total, bucket) => total + bucket.retainedBytes,
          0
        )
      ).toBe(expectedBytes)
    } finally {
      controller.dispose()
    }
  })

  it('bounds spans, fetches, record bytes, and reports irreversible loss', () => {
    const controller = new RequestInsights()
    try {
      for (let index = 0; index < 205; index++) {
        controller.recordSpan({
          name: `operation-${index}-${'x'.repeat(400)}`,
          timestamp: index,
          requestId: 'bounded-record',
          rootRequestId: 'bounded-record',
        })
        controller.recordFetch(
          {
            requestId: 'bounded-record',
            rootRequestId: 'bounded-record',
          },
          {
            url: `/fetch/${index}`,
            startTime: index + 0.5,
            durationMs: 1,
            index,
          }
        )
      }

      const request = controller.getSnapshot().requests[0]
      expect(request.spans.length).toBeLessThanOrEqual(200)
      expect(request.fetches.length).toBeLessThanOrEqual(200)
      expect(request.truncatedSpanCount).toBeGreaterThan(0)
      expect(request.truncatedFetchCount).toBeGreaterThan(0)
      expect(
        Buffer.byteLength(JSON.stringify(request), 'utf8')
      ).toBeLessThanOrEqual(REQUEST_INSIGHTS_MAX_BYTES_PER_RECORD)
    } finally {
      controller.dispose()
    }
  })

  it('keeps exactly the newest 200 small spans and fetches per record', () => {
    const controller = new RequestInsights()
    try {
      for (let index = 0; index < 205; index++) {
        controller.recordSpan({
          name: `s${index}`,
          timestamp: index,
          requestId: 'span-cap',
          rootRequestId: 'span-cap',
        })
        controller.recordFetch(
          { requestId: 'fetch-cap', rootRequestId: 'fetch-cap' },
          { url: `/f/${index}`, startTime: index, index }
        )
      }

      const requests = controller.getSnapshot().requests
      const spanRequest = requests.find(
        (request) => request.requestId === 'span-cap'
      )!
      const fetchRequest = requests.find(
        (request) => request.requestId === 'fetch-cap'
      )!
      expect(spanRequest.spans).toHaveLength(200)
      expect(spanRequest.spans[0].name).toBe('s5')
      expect(spanRequest.truncatedSpanCount).toBe(5)
      expect(fetchRequest.fetches).toHaveLength(200)
      expect(fetchRequest.fetches[0].url).toBe('/f/5')
      expect(fetchRequest.truncatedFetchCount).toBe(5)
    } finally {
      controller.dispose()
    }
  })

  it('bounds individual spans and reports event, link, and metadata loss', () => {
    const controller = new RequestInsights()
    try {
      controller.recordSpan({
        name: 'x'.repeat(10_000),
        timestamp: 1,
        requestId: 'bounded-span',
        rootRequestId: 'bounded-span',
        attributes: {
          'next.span_type': 'test.bounded',
          'next.span_name': 'y'.repeat(10_000),
          'next.segment': Array.from(
            { length: 30 },
            (_, index) => `segment-${index}-${'z'.repeat(100)}`
          ),
        },
        events: Array.from({ length: 25 }, (_, index) => ({
          name: `event-${index}-${'e'.repeat(500)}`,
          timestamp: index,
          attributes: { 'next.segment': 'a'.repeat(1_000) },
        })),
        links: Array.from({ length: 20 }, (_, index) => ({
          traceId: `trace-${index}`,
          spanId: `span-${index}`,
          attributes: { 'next.segment': 'b'.repeat(1_000) },
        })),
      })

      const span = controller.getSnapshot().requests[0].spans[0]
      expect(span.name.length).toBeLessThanOrEqual(512)
      expect(span.events?.length).toBeLessThanOrEqual(16)
      expect(span.links?.length).toBeLessThanOrEqual(8)
      expect(span.truncatedEventCount).toBeGreaterThanOrEqual(9)
      expect(span.truncatedLinkCount).toBeGreaterThanOrEqual(12)
      expect(span.truncatedMetadataValueCount).toBeGreaterThan(0)
      expect(
        Buffer.byteLength(JSON.stringify(span), 'utf8')
      ).toBeLessThanOrEqual(REQUEST_INSIGHTS_MAX_BYTES_PER_SPAN)
    } finally {
      controller.dispose()
    }
  })

  it('bounds each logical root atomically and keeps omission metadata on its root', () => {
    const controller = new RequestInsights()
    try {
      controller.recordFetch(
        { requestId: 'root', rootRequestId: 'root', source: 'page' },
        { url: '/root', startTime: 0, durationMs: 1 }
      )
      for (let index = 0; index < 16; index++) {
        controller.recordFetch(
          {
            requestId: `child-${index}`,
            rootRequestId: 'root',
            source: 'app-route',
          },
          { url: `/child/${index}`, startTime: index + 1, durationMs: 1 }
        )
      }

      const requests = controller.getSnapshot().requests
      expect(requests).toHaveLength(15)
      expect(requests[0]).toEqual(
        expect.objectContaining({
          requestId: 'root',
          omittedRequestCount: 2,
        })
      )
      expect(
        requests.every((request) => request.rootRequestId === 'root')
      ).toBe(true)
    } finally {
      controller.dispose()
    }
  })

  it('reconciles live and paused clients when trimming records from a retained root', () => {
    const controller = new RequestInsights()
    let liveRequests: RequestInsight[] = []
    let liveByteLengths = createRequestInsightsByteLengthCache(liveRequests)
    let pausedRequests: RequestInsight[] | null = null
    const snapshots: string[][] = []
    controller.subscribe((insight, capture) => {
      const update = updateRequestInsights(
        liveRequests,
        liveByteLengths,
        insight,
        capture
      )
      liveRequests = update.requests
      liveByteLengths = update.byteLengths
    })
    controller.subscribeSnapshots((snapshot) => {
      liveRequests = snapshot.requests
      liveByteLengths = createRequestInsightsByteLengthCache(liveRequests)
      if (pausedRequests !== null) pausedRequests = snapshot.requests
      snapshots.push(snapshot.requests.map(({ requestId }) => requestId))
    })

    try {
      controller.recordFetch(
        { requestId: 'root', rootRequestId: 'root', source: 'page' },
        { url: '/root', startTime: 0 }
      )
      for (let index = 0; index < 14; index++) {
        controller.recordFetch(
          {
            requestId: `child-${index}`,
            rootRequestId: 'root',
            source: 'app-route',
          },
          { url: `/child/${index}`, startTime: index + 1 }
        )
      }
      pausedRequests = liveRequests
      expect(snapshots).toEqual([])

      for (let index = 14; index < 17; index++) {
        controller.recordFetch(
          {
            requestId: `child-${index}`,
            rootRequestId: 'root',
            source: 'app-route',
          },
          { url: `/child/${index}`, startTime: index + 1 }
        )
      }

      const serverRequestIds = controller
        .getSnapshot()
        .requests.map(({ requestId }) => requestId)
      const expectedRequestIds = [
        'root',
        ...Array.from({ length: 14 }, (_, index) => `child-${index + 3}`),
      ]
      expect(serverRequestIds).toEqual(expectedRequestIds)
      expect(liveRequests.map(({ requestId }) => requestId)).toEqual(
        expectedRequestIds
      )
      expect(pausedRequests?.map(({ requestId }) => requestId)).toEqual(
        expectedRequestIds
      )
      expect(snapshots).toHaveLength(3)
      expect(
        liveRequests.some(({ requestId }) => requestId === 'child-0')
      ).toBe(false)
      expect(
        pausedRequests?.some(({ requestId }) => requestId === 'child-0')
      ).toBe(false)

      controller.recordFetch(
        { requestId: 'child-16', rootRequestId: 'root', source: 'app-route' },
        { url: '/child/16/second', startTime: 100 }
      )
      expect(snapshots).toHaveLength(3)
    } finally {
      controller.dispose()
    }
  })

  it('closes an evicted root so late spans and fetches cannot resurrect it', () => {
    const controller = new RequestInsights({ maxRequestGroupsPerBucket: 1 })
    const evictedRetention = createRequestInsightsRetentionContext()
    const evictedChildRetention =
      createRequestInsightsRetentionContext(evictedRetention)
    try {
      controller.recordFetch(
        {
          requestId: 'evicted',
          rootRequestId: 'evicted',
          retention: evictedRetention,
          source: 'page',
        },
        { url: '/evicted', startTime: 1, durationMs: 1 }
      )
      controller.recordFetch(
        {
          requestId: 'evicted-child',
          rootRequestId: 'evicted',
          retention: evictedChildRetention,
          source: 'app-route',
        },
        { url: '/evicted-child', startTime: 1.5, durationMs: 1 }
      )
      controller.recordFetch(
        {
          requestId: 'retained',
          rootRequestId: 'retained',
          retention: createRequestInsightsRetentionContext(),
          source: 'page',
        },
        { url: '/retained', startTime: 2, durationMs: 1 }
      )

      expect(isRequestInsightsRetentionContextOpen(evictedRetention)).toBe(
        false
      )
      expect(isRequestInsightsRetentionContextOpen(evictedChildRetention)).toBe(
        false
      )
      controller.recordSpan({
        name: 'late span',
        timestamp: 3,
        requestId: 'evicted-child',
        rootRequestId: 'evicted',
        requestInsightsRetention: evictedChildRetention,
      })
      controller.recordFetch(
        {
          requestId: 'evicted',
          rootRequestId: 'evicted',
          retention: evictedRetention,
        },
        { url: '/late', startTime: 3, durationMs: 1 }
      )

      expect(
        controller.getSnapshot().requests.map((request) => request.requestId)
      ).toEqual(['retained'])
      expect(
        controller
          .getCaptureState()
          .usage.buckets.find((bucket) => bucket.bucket === 'page')
          ?.evictedRequestGroupCount
      ).toBe(1)
    } finally {
      controller.dispose()
    }
  })

  it('publishes isolated deep clones to snapshots and every subscriber', () => {
    const controller = new RequestInsights()
    const firstListener = jest.fn((insight) => {
      insight.spans[0].name = 'mutated-listener'
      const segment = insight.spans[0].attributes?.['next.segment']
      if (Array.isArray(segment)) segment[0] = 'mutated-array'
    })
    const secondListener = jest.fn()
    controller.subscribe(firstListener)
    controller.subscribe(secondListener)
    try {
      controller.recordSpan({
        name: 'original',
        timestamp: 1,
        requestId: 'isolated',
        rootRequestId: 'isolated',
        attributes: {
          'next.segment': ['original-array'],
        },
      })

      expect(secondListener.mock.calls[0][0].spans[0].name).toBe('original')
      expect(
        secondListener.mock.calls[0][0].spans[0].attributes?.['next.segment']
      ).toEqual(['original-array'])

      const firstSnapshot = controller.getSnapshot()
      firstSnapshot.requests[0].spans[0].name = 'mutated-snapshot'
      ;(
        firstSnapshot.requests[0].spans[0].attributes?.[
          'next.segment'
        ] as string[]
      )[0] = 'mutated-snapshot-array'
      const secondSnapshot = controller.getSnapshot()
      expect(secondSnapshot.requests[0].spans[0].name).toBe('original')
      expect(
        secondSnapshot.requests[0].spans[0].attributes?.['next.segment']
      ).toEqual(['original-array'])
    } finally {
      controller.dispose()
    }
  })

  it('reuses cached byte lengths when projecting unchanged retained groups', () => {
    const controller = new RequestInsights()
    controller.recordFetch(
      { requestId: 'root', rootRequestId: 'root', source: 'page' },
      { url: '/root', startTime: 1, durationMs: 1 }
    )
    controller.recordFetch(
      { requestId: 'child', rootRequestId: 'root', source: 'app-route' },
      { url: '/child', startTime: 2, durationMs: 1 }
    )

    const stringify = jest.spyOn(JSON, 'stringify')
    try {
      controller.getSnapshot()
      controller.getSnapshot()

      expect(
        stringify.mock.calls.some(([value]) => {
          if (Array.isArray(value)) {
            return value.some(
              (item) =>
                typeof item === 'object' && item !== null && 'requestId' in item
            )
          }
          return (
            typeof value === 'object' && value !== null && 'requestId' in value
          )
        })
      ).toBe(false)
    } finally {
      stringify.mockRestore()
      controller.dispose()
    }
  })

  it('projects whole logical roots fairly under the snapshot byte cap', () => {
    const maxSnapshotBytes = 3_500
    const controller = new RequestInsights({ maxSnapshotBytes })
    try {
      for (let index = 0; index < 6; index++) {
        for (const source of ['page', 'app-route'] as const) {
          const prefix = source === 'page' ? 'page' : 'api'
          controller.recordSpan({
            name: `${prefix}-${index}-${'x'.repeat(400)}`,
            timestamp: index,
            requestId: `${prefix}-${index}`,
            rootRequestId: `${prefix}-${index}`,
            requestInsightSource: source,
          })
        }
      }

      const snapshot = controller.getSnapshot()
      expect(
        getRequestInsightsSerializedByteLength(snapshot)
      ).toBeLessThanOrEqual(maxSnapshotBytes)
      expect(snapshot.projection?.omittedRequestGroupCount).toBeGreaterThan(0)
      expect(
        snapshot.requests.some((request) => request.source === 'page')
      ).toBe(true)
      expect(
        snapshot.requests.some((request) => request.source === 'app-route')
      ).toBe(true)
      expect(snapshot.projection?.buckets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ bucket: 'page' }),
          expect.objectContaining({ bucket: 'api' }),
        ])
      )
    } finally {
      controller.dispose()
    }
  })

  it('queries and limits whole logical roots without conflating projection loss with capture eviction', () => {
    const controller = new RequestInsights({ maxRequestGroupsPerBucket: 3 })
    try {
      controller.recordFetch(
        { requestId: 'root', rootRequestId: 'root', source: 'page' },
        { url: '/root', startTime: 1, durationMs: 1 }
      )
      controller.recordFetch(
        { requestId: 'child', rootRequestId: 'root', source: 'app-route' },
        { url: '/child', startTime: 2, durationMs: 1 }
      )
      controller.recordFetch(
        { requestId: 'other', rootRequestId: 'other', source: 'page' },
        { url: '/other', startTime: 3, durationMs: 1 }
      )
      controller.recordFetch(
        { requestId: 'newest', rootRequestId: 'newest', source: 'page' },
        { url: '/newest', startTime: 4, durationMs: 1 }
      )

      const childQuery = controller.getSnapshot({ requestId: 'child' })
      expect(childQuery.requests.map((request) => request.requestId)).toEqual([
        'root',
        'child',
      ])

      const limited = controller.getSnapshot({ limit: 1 })
      expect(
        new Set(limited.requests.map((request) => request.rootRequestId))
      ).toEqual(new Set(['newest']))
      expect(limited.projection?.omittedRequestGroupCount).toBe(2)
      expect(
        limited.capture?.usage.buckets.find(
          (bucket) => bucket.bucket === 'page'
        )?.evictedRequestGroupCount
      ).toBe(0)
      expect(
        getRequestInsightsSerializedByteLength(controller.getSnapshot())
      ).toBeLessThanOrEqual(REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES)
    } finally {
      controller.dispose()
    }
  })

  it('counts serialized UTF-8 bytes exactly', () => {
    for (const value of [
      'ascii',
      'é',
      '😀',
      '\ud800',
      'line\nseparator\u2028',
      { nested: ['😀', 'é', '\udfff'] },
    ]) {
      expect(getRequestInsightsSerializedByteLength(value)).toBe(
        Buffer.byteLength(JSON.stringify(value), 'utf8')
      )
    }
  })

  it('enforces the exact snapshot boundary for UTF-8 logical roots', () => {
    const createRequest = (
      requestId: string,
      source: RequestInsight['source'],
      route: string
    ): RequestInsight => ({
      requestId,
      rootRequestId: requestId,
      source,
      htmlRequestId: requestId,
      route,
      startTime: 1,
      status: 'ok',
      spans: [],
      fetches: [],
    })
    const groups = Array.from({ length: 6 }, (_, index) => [
      createRequest(`root-${index}`, 'page', `/é/😀/${index}`),
    ])
    const fullSnapshotByteLength = getRequestInsightsSerializedByteLength({
      requests: groups.flat(),
    })

    const exact = createBoundedRequestInsightsSnapshotProjection(
      groups,
      fullSnapshotByteLength
    )
    expect(exact.snapshotByteLength).toBe(fullSnapshotByteLength)
    expect(exact.snapshot.requests).toHaveLength(groups.length)

    const below = createBoundedRequestInsightsSnapshotProjection(
      groups,
      fullSnapshotByteLength - 1
    )
    expect(below.snapshotByteLength).toBeLessThanOrEqual(
      fullSnapshotByteLength - 1
    )
    expect(below.snapshot.requests.length).toBeLessThan(groups.length)

    const largeGroups = Array.from({ length: 72 }, (_, index) => [
      createRequest(`large-${index}`, 'page', `/${'é'.repeat(30_000)}`),
    ])
    const bounded = createBoundedRequestInsightsSnapshotProjection(
      largeGroups,
      REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES
    )
    expect(bounded.snapshotByteLength).toBeLessThanOrEqual(
      REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES
    )
    expect(
      bounded.snapshot.projection?.omittedRequestGroupCount
    ).toBeGreaterThan(0)
  })

  it('uses the canonical root to bucket a child-first projection group', () => {
    const createRequest = (
      requestId: string,
      rootRequestId: string,
      source: RequestInsight['source']
    ): RequestInsight => ({
      requestId,
      rootRequestId,
      source,
      htmlRequestId: rootRequestId,
      startTime: 1,
      status: 'ok',
      spans: [],
      fetches: [],
    })
    const childFirstPageGroup = [
      createRequest('child', 'root', 'app-route'),
      createRequest('root', 'root', 'page'),
    ]
    const newerApiGroup = [createRequest('api', 'api', 'app-route')]

    const { snapshot } = createBoundedRequestInsightsSnapshotProjection(
      [childFirstPageGroup, newerApiGroup],
      REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES,
      undefined,
      1
    )
    expect(snapshot.requests.map((request) => request.requestId)).toEqual([
      'api',
    ])
    expect(snapshot.projection?.buckets).toEqual([
      { bucket: 'page', omittedRequestGroupCount: 1 },
    ])
  })

  it('keeps creation order when a retained root changes buckets', () => {
    const controller = new RequestInsights({ maxRequestGroupsPerBucket: 1 })
    try {
      controller.recordFetch(
        { requestId: 'older', rootRequestId: 'older' },
        { url: '/older', startTime: 1 }
      )
      controller.recordFetch(
        { requestId: 'newer', rootRequestId: 'newer', source: 'page' },
        { url: '/newer', startTime: 2 }
      )

      controller.recordSource(
        { requestId: 'older', rootRequestId: 'older' },
        'page'
      )

      expect(
        controller.getSnapshot().requests.map((request) => request.requestId)
      ).toEqual(['newer'])
    } finally {
      controller.dispose()
    }
  })

  it('closes a record omitted from a retained logical root', () => {
    const controller = new RequestInsights()
    const rootRetention = createRequestInsightsRetentionContext()
    const omittedRetention =
      createRequestInsightsRetentionContext(rootRetention)
    try {
      controller.recordFetch(
        {
          requestId: 'root',
          rootRequestId: 'root',
          retention: rootRetention,
          source: 'page',
        },
        { url: '/root', startTime: 0 }
      )
      for (let index = 0; index < 15; index++) {
        controller.recordFetch(
          {
            requestId: `child-${index}`,
            rootRequestId: 'root',
            retention:
              index === 0
                ? omittedRetention
                : createRequestInsightsRetentionContext(rootRetention),
          },
          { url: `/child/${index}`, startTime: index + 1 }
        )
      }

      expect(isRequestInsightsRetentionContextOpen(rootRetention)).toBe(true)
      expect(isRequestInsightsRetentionContextOpen(omittedRetention)).toBe(
        false
      )
      controller.recordFetch(
        {
          requestId: 'child-0',
          rootRequestId: 'root',
          retention: omittedRetention,
        },
        { url: '/late', startTime: 100 }
      )
      const snapshot = controller.getSnapshot()
      expect(
        snapshot.requests.some((request) => request.requestId === 'child-0')
      ).toBe(false)
      expect(
        snapshot.requests.find((request) => request.requestId === 'root')
          ?.omittedRequestCount
      ).toBe(1)
    } finally {
      controller.dispose()
    }
  })

  it('rejects a related context created after its root was evicted', () => {
    const controller = new RequestInsights({ maxRequestGroupsPerBucket: 1 })
    const evictedRetention = createRequestInsightsRetentionContext()
    try {
      controller.recordFetch(
        {
          requestId: 'evicted',
          rootRequestId: 'evicted',
          retention: evictedRetention,
          source: 'page',
        },
        { url: '/evicted', startTime: 1 }
      )
      controller.recordFetch(
        {
          requestId: 'retained',
          rootRequestId: 'retained',
          retention: createRequestInsightsRetentionContext(),
          source: 'page',
        },
        { url: '/retained', startTime: 2 }
      )

      const lateChildRetention =
        createRequestInsightsRetentionContext(evictedRetention)
      expect(isRequestInsightsRetentionContextOpen(lateChildRetention)).toBe(
        false
      )
      controller.recordFetch(
        {
          requestId: 'late-child',
          rootRequestId: 'evicted',
          retention: lateChildRetention,
        },
        { url: '/late-child', startTime: 3 }
      )
      expect(
        controller.getSnapshot().requests.map((request) => request.requestId)
      ).toEqual(['retained'])
    } finally {
      controller.dispose()
    }
  })

  it('keeps late callbacks closed after clear and dispose', () => {
    const cleared = new RequestInsights()
    const clearedSnapshots = jest.fn()
    cleared.subscribeSnapshots(clearedSnapshots)
    const clearedRetention = createRequestInsightsRetentionContext()
    cleared.recordFetch(
      {
        requestId: 'cleared',
        rootRequestId: 'cleared',
        retention: clearedRetention,
      },
      { url: '/cleared', startTime: 1 }
    )
    cleared.clear()
    expect(clearedSnapshots).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requests: [],
        capture: expect.objectContaining({
          usage: expect.objectContaining({ retainedRequestCount: 0 }),
        }),
      })
    )
    expect(cleared.getCaptureState().usage).toEqual(
      expect.objectContaining({
        retainedRequestGroupCount: 0,
        retainedRequestCount: 0,
        retainedBytes: 0,
        buckets: expect.arrayContaining([
          expect.objectContaining({
            bucket: 'unknown',
            retainedRequestGroupCount: 0,
            retainedRequestCount: 0,
            retainedBytes: 0,
          }),
        ]),
      })
    )
    cleared.recordFetch(
      {
        requestId: 'cleared',
        rootRequestId: 'cleared',
        retention: clearedRetention,
      },
      { url: '/late', startTime: 2 }
    )
    expect(cleared.getSnapshot().requests).toEqual([])
    cleared.dispose()

    const disposed = new RequestInsights()
    const disposedRetention = createRequestInsightsRetentionContext()
    disposed.recordFetch(
      {
        requestId: 'disposed',
        rootRequestId: 'disposed',
        retention: disposedRetention,
      },
      { url: '/disposed', startTime: 1 }
    )
    disposed.dispose()
    disposed.recordFetch(
      {
        requestId: 'disposed',
        rootRequestId: 'disposed',
        retention: disposedRetention,
      },
      { url: '/late', startTime: 2 }
    )
    expect(disposed.getSnapshot()).toEqual({ requests: [] })
  })

  it('normalizes and copies configurable capture limits once', () => {
    const mutableOptions = {
      maxBytesPerRetentionBucket: 1_200.9,
      maxRetainedBytes: 1_500.9,
      maxRequestGroupsPerBucket: 2.9,
      maxSnapshotBytes: 3_500.9,
    }
    const controller = new RequestInsights(mutableOptions)
    mutableOptions.maxRequestGroupsPerBucket = 100
    expect(controller.getCaptureState().limits).toEqual(
      expect.objectContaining({
        maxBytesPerBucket: 1_200,
        maxRetainedBytes: 1_500,
        maxRequestGroupsPerBucket: 2,
        maxSnapshotBytes: 3_500,
      })
    )
    controller.dispose()

    const invalid = new RequestInsights({
      maxBytesPerRetentionBucket: Number.NaN,
      maxRetainedBytes: Number.POSITIVE_INFINITY,
      maxRequestGroupsPerBucket: -1,
      maxSnapshotBytes: -1,
    })
    expect(invalid.getCaptureState().limits).toEqual(
      expect.objectContaining({
        maxBytesPerBucket: REQUEST_INSIGHTS_MAX_BYTES_PER_RETENTION_BUCKET,
        maxRetainedBytes: REQUEST_INSIGHTS_MAX_RETAINED_BYTES,
        maxRequestGroupsPerBucket:
          REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET,
        maxSnapshotBytes: REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES,
      })
    )
    invalid.dispose()

    const zero = new RequestInsights({
      maxBytesPerRetentionBucket: 0,
      maxRetainedBytes: 0,
      maxRequestGroupsPerBucket: 0,
      maxSnapshotBytes: 0,
    })
    zero.recordFetch(
      { requestId: 'not-retained', rootRequestId: 'not-retained' },
      { url: '/not-retained', startTime: 1 }
    )
    const zeroSnapshot = zero.getSnapshot()
    expect(zeroSnapshot.requests).toEqual([])
    expect(zero.getCaptureState().limits).toEqual(
      expect.objectContaining({
        maxBytesPerBucket: 0,
        maxRetainedBytes: 0,
        maxRequestGroupsPerBucket: 0,
      })
    )
    expect(zero.getCaptureState().limits.maxSnapshotBytes).toBeGreaterThan(0)
    expect(zero.getCaptureState().limits.maxSnapshotBytes).toBeLessThan(
      REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES
    )
    expect(
      getRequestInsightsSerializedByteLength(zeroSnapshot)
    ).toBeLessThanOrEqual(zero.getCaptureState().limits.maxSnapshotBytes)
    zero.dispose()
  })

  it('applies a bounded live group limit and trims every bucket immediately', () => {
    const controller = new RequestInsights()
    const snapshots = jest.fn()
    controller.subscribeSnapshots(snapshots)
    try {
      for (let index = 0; index < 3; index++) {
        controller.recordFetch(
          {
            requestId: `page-${index}`,
            rootRequestId: `page-${index}`,
            source: 'page',
          },
          { url: `/page-${index}`, startTime: index }
        )
        controller.recordFetch(
          {
            requestId: `api-${index}`,
            rootRequestId: `api-${index}`,
            source: 'app-route',
          },
          { url: `/api/${index}`, startTime: index }
        )
      }

      controller.setMaxRequestGroupsPerBucket(1)

      expect(
        controller.getSnapshot().requests.map((request) => request.requestId)
      ).toEqual(['page-2', 'api-2'])
      expect(
        controller.getCaptureState().limits.maxRequestGroupsPerBucket
      ).toBe(1)
      expect(snapshots).toHaveBeenLastCalledWith(
        expect.objectContaining({
          requests: expect.arrayContaining([
            expect.objectContaining({ requestId: 'page-2' }),
            expect.objectContaining({ requestId: 'api-2' }),
          ]),
          capture: expect.objectContaining({
            limits: expect.objectContaining({ maxRequestGroupsPerBucket: 1 }),
          }),
        })
      )
      expect(() => controller.setMaxRequestGroupsPerBucket(0)).toThrow(
        RangeError
      )
      expect(() =>
        controller.setMaxRequestGroupsPerBucket(
          REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET + 1
        )
      ).toThrow(RangeError)

      controller.setMaxRequestGroupsPerBucket(undefined)
      expect(
        controller.getCaptureState().limits.maxRequestGroupsPerBucket
      ).toBe(REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET)
      expect(snapshots).toHaveBeenCalledTimes(2)
    } finally {
      controller.dispose()
    }
  })

  it('keeps per-bucket capture counters consistent through migration and eviction', () => {
    const controller = new RequestInsights()
    try {
      controller.recordFetch(
        { requestId: 'root', rootRequestId: 'root', source: 'page' },
        { url: '/root', startTime: 1 }
      )
      controller.recordFetch(
        {
          requestId: 'validation',
          rootRequestId: 'root',
          kind: 'instant-insights',
          source: 'instant-insights',
        },
        { url: '/validation', startTime: 2 }
      )

      controller.recordSource(
        { requestId: 'root', rootRequestId: 'root' },
        'app-route'
      )

      const migrated = controller.getCaptureState().usage.buckets
      expect(migrated.find((bucket) => bucket.bucket === 'page')).toEqual(
        expect.objectContaining({
          retainedRequestGroupCount: 0,
          retainedRequestCount: 0,
        })
      )
      expect(migrated.find((bucket) => bucket.bucket === 'api')).toEqual(
        expect.objectContaining({
          retainedRequestGroupCount: 1,
          retainedRequestCount: 2,
        })
      )

      controller.recordFetch(
        { requestId: 'new-api', source: 'app-route' },
        { url: '/new-api', startTime: 3 }
      )
      controller.setMaxRequestGroupsPerBucket(1)

      const evicted = controller
        .getCaptureState()
        .usage.buckets.find((bucket) => bucket.bucket === 'api')
      expect(evicted).toEqual(
        expect.objectContaining({
          retainedRequestGroupCount: 1,
          retainedRequestCount: 1,
          evictedRequestGroupCount: 1,
        })
      )
    } finally {
      controller.dispose()
    }
  })

  test('keeps a response pending until delivery actually finishes', () => {
    const identity = { requestId: 'response-pending' }

    requestInsights.startResponse(identity, 100)
    recordSpan({
      name: 'GET /stream',
      requestId: identity.requestId,
      startTime: 110,
      durationMs: 20,
      status: 'ok',
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })

    expect(requestInsights.getSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        status: 'pending',
        response: {
          trackingStartTime: 100,
          outcome: 'pending',
        },
      })
    )

    requestInsights.completeResponse(identity, {
      trackingStartTime: 100,
      endTime: 175,
      statusCode: 202,
      outcome: 'finished',
    })

    expect(requestInsights.getSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        startTime: 100,
        durationMs: 75,
        status: 'ok',
        response: {
          trackingStartTime: 100,
          endTime: 175,
          statusCode: 202,
          outcome: 'finished',
          error: undefined,
        },
      })
    )
  })

  test('accounts for response lifecycle bytes and isolates published response data', () => {
    const unsubscribe = requestInsights.subscribe((insight) => {
      if (insight.response?.outcome !== 'errored') {
        return
      }

      insight.response.endTime = 1
      if (insight.response.error) {
        insight.response.error.type = 'mutated'
      }
    })

    requestInsights.startResponse({ requestId: 'isolated-response' }, 100)
    requestInsights.completeResponse(
      { requestId: 'isolated-response' },
      {
        trackingStartTime: 100,
        endTime: 150,
        statusCode: 500,
        outcome: 'errored',
        error: { type: 'private-error-name' },
      }
    )

    const snapshot = requestInsights.getSnapshot()
    expect(snapshot.requests[0].response).toEqual({
      trackingStartTime: 100,
      endTime: 150,
      statusCode: 500,
      outcome: 'errored',
      error: { type: 'Error' },
    })
    expect(snapshot.capture?.usage.retainedBytes).toBe(
      Buffer.byteLength(JSON.stringify(snapshot.requests[0]), 'utf8')
    )
    unsubscribe()
  })

  test('keeps delivery timing when the request span arrives after completion', () => {
    const identity = { requestId: 'response-before-request-span' }

    requestInsights.startResponse(identity, 100)
    requestInsights.completeResponse(identity, {
      trackingStartTime: 100,
      endTime: 200,
      statusCode: 200,
      outcome: 'finished',
    })
    recordSpan({
      name: 'GET /stream',
      requestId: identity.requestId,
      startTime: 110,
      durationMs: 20,
      status: 'ok',
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })

    expect(requestInsights.getSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        startTime: 100,
        durationMs: 100,
        status: 'ok',
        response: expect.objectContaining({
          endTime: 200,
          outcome: 'finished',
        }),
      })
    )
  })

  test('keeps aborts and errors sticky after response completion', () => {
    const abortedIdentity = { requestId: 'response-aborted' }
    requestInsights.startResponse(abortedIdentity, 100)
    requestInsights.completeResponse(abortedIdentity, {
      trackingStartTime: 100,
      endTime: 125,
      statusCode: 200,
      outcome: 'aborted',
      error: { type: 'ResponseAborted' },
    })
    recordSpan({
      name: 'late abort cleanup',
      requestId: abortedIdentity.requestId,
      startTime: 120,
      durationMs: 10,
      status: 'error',
      error: { type: 'AbortError' },
    })
    requestInsights.completeResponse(abortedIdentity, {
      trackingStartTime: 100,
      endTime: 150,
      statusCode: 200,
      outcome: 'finished',
    })

    const erroredIdentity = { requestId: 'response-errored' }
    requestInsights.startResponse(erroredIdentity, 200)
    requestInsights.completeResponse(erroredIdentity, {
      trackingStartTime: 200,
      endTime: 225,
      statusCode: 200,
      outcome: 'errored',
      error: { type: 'private-error-name' },
    })
    recordSpan({
      name: 'late successful cleanup',
      requestId: erroredIdentity.requestId,
      startTime: 225,
      durationMs: 5,
      status: 'ok',
    })

    const routeErrorIdentity = { requestId: 'route-error-then-abort' }
    requestInsights.startResponse(routeErrorIdentity, 300)
    recordSpan({
      name: 'route failed',
      requestId: routeErrorIdentity.requestId,
      startTime: 310,
      durationMs: 5,
      status: 'error',
      error: { type: 'Error' },
    })
    requestInsights.completeResponse(routeErrorIdentity, {
      trackingStartTime: 300,
      endTime: 325,
      statusCode: 200,
      outcome: 'aborted',
      error: { type: 'ResponseAborted' },
    })

    expect(requestInsights.getSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: abortedIdentity.requestId,
        status: 'aborted',
        response: expect.objectContaining({ outcome: 'aborted' }),
      }),
      expect.objectContaining({
        requestId: erroredIdentity.requestId,
        status: 'error',
        response: expect.objectContaining({
          outcome: 'errored',
          error: { type: 'Error' },
        }),
      }),
      expect.objectContaining({
        requestId: routeErrorIdentity.requestId,
        status: 'error',
        response: expect.objectContaining({ outcome: 'aborted' }),
      }),
    ])
  })

  test('captures the committed Node status and completes only once', () => {
    const originalWriteHead = function (
      this: ServerResponse,
      statusCode: number
    ) {
      Object.assign(this, { headersSent: true, statusCode })
      return this
    } as ServerResponse['writeHead']
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      errored: null,
      headersSent: false,
      statusCode: 200,
      writableFinished: false,
      writeHead: originalWriteHead,
    }) as unknown as ServerResponse
    const identity = { requestId: 'node-response' }
    const onComplete = jest.fn((lifecycle: RequestInsightResponseLifecycle) => {
      requestInsights.completeResponse(identity, lifecycle)
    })

    trackRequestInsightNodeResponse(response, {
      onAttach(trackingStartTime) {
        requestInsights.startResponse(identity, trackingStartTime)
      },
      onComplete,
    })
    response.writeHead(202)
    expect(response.writeHead).toBe(originalWriteHead)

    Object.assign(response, {
      statusCode: 500,
      writableFinished: true,
    })
    response.emit('finish')
    response.emit('close')

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(requestInsights.getSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        status: 'ok',
        response: expect.objectContaining({
          statusCode: 202,
          outcome: 'finished',
        }),
      })
    )
    expect(response.listenerCount('finish')).toBe(0)
    expect(response.listenerCount('close')).toBe(0)
  })

  test('does not let diagnostic callback failures affect a Node response', () => {
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      errored: null,
      headersSent: true,
      statusCode: 200,
      writableFinished: false,
    }) as unknown as ServerResponse
    const consoleError = jest.spyOn(console, 'error').mockImplementation()

    try {
      expect(() =>
        trackRequestInsightNodeResponse(response, {
          onAttach() {
            throw new Error('attach failed')
          },
          onComplete() {
            throw new Error('complete failed')
          },
        })
      ).not.toThrow()

      Object.assign(response, { writableFinished: true })
      expect(() => response.emit('finish')).not.toThrow()
      expect(consoleError).toHaveBeenCalledTimes(2)
      expect(response.listenerCount('finish')).toBe(0)
      expect(response.listenerCount('close')).toBe(0)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('completes the controller captured at attachment after ALS exits', () => {
    process.env.__NEXT_DEV_SERVER = '1'
    const first = new RequestInsights()
    const second = new RequestInsights()
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      errored: null,
      headersSent: true,
      statusCode: 200,
      writableFinished: false,
    }) as unknown as ServerResponse
    const identity = { requestId: 'owned-response' }

    try {
      trackRequestInsightNodeResponse(response, {
        onAttach(trackingStartTime) {
          first.startResponse(identity, trackingStartTime)
        },
        onComplete(lifecycle) {
          first.completeResponse(identity, lifecycle)
        },
      })

      Object.assign(response, { writableFinished: true })
      runWithRequestInsights(second, () => response.emit('finish'))

      expect(first.getSnapshot().requests[0]).toEqual(
        expect.objectContaining({
          response: expect.objectContaining({ outcome: 'finished' }),
        })
      )
      expect(second.getSnapshot()).toEqual({ requests: [] })
    } finally {
      first.dispose()
      second.dispose()
    }
  })

  it('records Web completion on the controller captured before consumption', async () => {
    process.env.__NEXT_DEV_SERVER = '1'
    const first = new RequestInsights()
    const second = new RequestInsights()
    const response = new WebNextResponse(undefined).body('complete')
    response.statusCode = 202
    const identity = { requestId: 'owned-web-response' }

    try {
      trackRequestInsightWebResponse(response, {
        onAttach(trackingStartTime) {
          first.startResponse(identity, trackingStartTime)
        },
        onComplete(lifecycle) {
          first.completeResponse(identity, lifecycle)
        },
      })
      response.send()
      const webResponse = await response.toResponse()
      await runWithRequestInsights(second, () => webResponse.text())

      expect(first.getSnapshot().requests[0]).toEqual(
        expect.objectContaining({
          status: 'ok',
          response: expect.objectContaining({
            outcome: 'finished',
            statusCode: 202,
          }),
        })
      )
      expect(second.getSnapshot()).toEqual({ requests: [] })
    } finally {
      first.dispose()
      second.dispose()
    }
  })

  it('ignores late response callbacks after controller disposal', () => {
    process.env.__NEXT_DEV_SERVER = '1'
    const controller = new RequestInsights()
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      errored: null,
      headersSent: true,
      statusCode: 200,
      writableFinished: false,
    }) as unknown as ServerResponse
    const identity = { requestId: 'disposed-response' }

    trackRequestInsightNodeResponse(response, {
      onAttach(trackingStartTime) {
        controller.startResponse(identity, trackingStartTime)
      },
      onComplete(lifecycle) {
        controller.completeResponse(identity, lifecycle)
      },
    })
    controller.dispose()
    Object.assign(response, { writableFinished: true })

    expect(() => response.emit('finish')).not.toThrow()
    expect(controller.getSnapshot()).toEqual({ requests: [] })
  })
})
