import { postNextTelemetryPayload } from './post-telemetry-payload'

describe('postNextTelemetryPayload', () => {
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
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
  it('retains a timeout when the caller supplies a cancellation signal', async () => {
    const timeout = new AbortController()
    const timeoutSpy = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeout.signal)
    const caller = new AbortController()
    let started: () => void
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    global.fetch = jest.fn((_url, options) => {
      const signal = options!.signal!
      started()
      return new Promise((_resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason)
          return
        }
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        })
      })
    }) as typeof fetch
    try {
      const pending = postNextTelemetryPayload(
        {
          meta: {},
          context: { anonymousId: 'a', projectId: 'p', sessionId: 's' },
          events: [],
        },
        caller.signal
      )
      await requestStarted
      timeout.abort()
      await pending
      expect(caller.signal.aborted).toBe(false)
      expect(timeoutSpy).toHaveBeenCalledWith(5000)
    } finally {
      timeoutSpy.mockRestore()
    }
  })

  it('preserves caller cancellation', async () => {
    const caller = new AbortController()
    caller.abort()
    global.fetch = jest.fn(async (_url, options) => {
      expect(options!.signal!.aborted).toBe(true)
      throw new Error('aborted')
    }) as typeof fetch
    await postNextTelemetryPayload(
      {
        meta: {},
        context: { anonymousId: 'a', projectId: 'p', sessionId: 's' },
        events: [],
      },
      caller.signal
    )
  })
})
