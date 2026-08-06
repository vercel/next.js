import { RequestInsights, getRequestInsightsSnapshot } from './request-insights'
import { runWithRequestInsights } from './request-insights-runtime'
import {
  isLocalSpanRecordingEnabled,
  isRequestInsightsEnabled,
  recordSpan,
  setSpanRecorderForTest,
  type SpanStoreRecord,
} from './span-store'

const originalRequestInsights = process.env.__NEXT_REQUEST_INSIGHTS
const originalDevServer = process.env.__NEXT_DEV_SERVER

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

describe('span recording', () => {
  let requestInsights: RequestInsights

  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    delete process.env.__NEXT_REQUEST_INSIGHTS
    requestInsights = new RequestInsights()
  })

  afterEach(() => {
    restoreEnv('__NEXT_REQUEST_INSIGHTS', originalRequestInsights)
    restoreEnv('__NEXT_DEV_SERVER', originalDevServer)
    setSpanRecorderForTest(undefined)
    requestInsights.dispose()
  })

  it('records completed spans only when there is a consumer', () => {
    const records: SpanStoreRecord[] = []

    expect(isLocalSpanRecordingEnabled()).toBe(false)
    recordSpan({ name: 'test.unconsumed' })
    expect(records).toEqual([])

    setSpanRecorderForTest((span) => records.push(span))
    expect(isLocalSpanRecordingEnabled()).toBe(true)
    recordSpan({
      name: 'test.consumed',
      attributes: {
        'next.phase': 'render',
      },
    })

    expect(records).toEqual([
      expect.objectContaining({
        name: 'test.consumed',
        timestamp: expect.any(Number),
        attributes: {
          'next.phase': 'render',
        },
      }),
    ])
  })

  it('forwards request spans directly to request insights', () => {
    runWithRequestInsights(requestInsights, () => {
      process.env.__NEXT_REQUEST_INSIGHTS = 'true'

      recordSpan({
        name: 'render route (app) /dashboard',
        startTime: 100,
        durationMs: 25,
        status: 'ok',
        requestId: 'req_1',
        route: '/dashboard',
      })

      expect(getRequestInsightsSnapshot()).toEqual(
        expect.objectContaining({
          requests: [
            expect.objectContaining({
              requestId: 'req_1',
              route: '/dashboard',
              spans: [
                expect.objectContaining({
                  name: 'render route (app) /dashboard',
                  startTime: 100,
                  durationMs: 25,
                }),
              ],
            }),
          ],
        })
      )
    })
  })

  it('does not record spans outside the dev server', () => {
    const recorder = jest.fn()
    delete process.env.__NEXT_DEV_SERVER
    runWithRequestInsights(requestInsights, () => {
      process.env.__NEXT_REQUEST_INSIGHTS = 'true'
      setSpanRecorderForTest(recorder)

      expect(isRequestInsightsEnabled()).toBe(false)
      expect(isLocalSpanRecordingEnabled()).toBe(false)

      recordSpan({ name: 'test.production', requestId: 'req_2' })
      expect(recorder).not.toHaveBeenCalled()
      expect(getRequestInsightsSnapshot()).toEqual({ requests: [] })
    })
  })

  it('treats an active request controller as enabled', () => {
    runWithRequestInsights(requestInsights, () => {
      expect(isRequestInsightsEnabled()).toBe(true)
    })
  })
})
