import { postNextTelemetryPayload } from './post-telemetry-payload'

describe('postNextTelemetryPayload', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('sends telemetry payload successfully', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
    })
    global.fetch = mockFetch

    const payload = {
      meta: { version: '1.0' },
      context: {
        anonymousId: 'test-id',
        projectId: 'test-project',
        sessionId: 'test-session',
      },
      events: [
        {
          eventName: 'test-event',
          fields: { foo: 'bar' },
        },
      ],
    }

    await postNextTelemetryPayload(payload)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://telemetry.nextjs.org/api/v1/record',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
        signal: expect.any(AbortSignal),
      }
    )
  })

  it('retries on failure', async () => {
    const mockFetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true })
    global.fetch = mockFetch

    const payload = {
      meta: {},
      context: {
        anonymousId: 'test-id',
        projectId: 'test-project',
        sessionId: 'test-session',
      },
      events: [],
    }

    await postNextTelemetryPayload(payload)

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('swallows errors after retries exhausted', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'))
    global.fetch = mockFetch

    const payload = {
      meta: {},
      context: {
        anonymousId: 'test-id',
        projectId: 'test-project',
        sessionId: 'test-session',
      },
      events: [],
    }

    // Should not throw
    await postNextTelemetryPayload(payload)

    expect(mockFetch).toHaveBeenCalledTimes(2) // Initial try + 1 retry
  })

  it('preserves the timeout when an abort signal is provided', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch

    const timeoutController = new AbortController()
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal)

    await postNextTelemetryPayload(
      {
        meta: {},
        context: {
          anonymousId: 'test-id',
          projectId: 'test-project',
          sessionId: 'test-session',
        },
        events: [],
      },
      new AbortController().signal
    )

    expect(AbortSignal.timeout).toHaveBeenCalledWith(5000)

    const requestSignal = (mockFetch.mock.calls[0][1] as RequestInit).signal
    const timeoutReason = new Error('timeout')

    expect(requestSignal?.aborted).toBe(false)
    timeoutController.abort(timeoutReason)
    expect(requestSignal?.reason).toBe(timeoutReason)
  })

  it('preserves caller cancellation when combining signals', async () => {
    const mockFetch = jest.fn().mockImplementation((_url, init) => {
      const requestSignal = init.signal as AbortSignal

      return new Promise((_resolve, reject) => {
        if (requestSignal.aborted) {
          reject(requestSignal.reason)
          return
        }
        requestSignal.addEventListener(
          'abort',
          () => reject(requestSignal.reason),
          { once: true }
        )
      })
    })
    global.fetch = mockFetch

    const callerController = new AbortController()
    const request = postNextTelemetryPayload(
      {
        meta: {},
        context: {
          anonymousId: 'test-id',
          projectId: 'test-project',
          sessionId: 'test-session',
        },
        events: [],
      },
      callerController.signal
    )

    const requestSignal = (mockFetch.mock.calls[0][1] as RequestInit).signal
    const callerReason = new Error('caller aborted')

    expect(requestSignal?.aborted).toBe(false)
    callerController.abort(callerReason)
    expect(requestSignal?.reason).toBe(callerReason)
    await request
  })
})
