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

  it('applies the built-in timeout even when a caller signal is provided', async () => {
    const timeoutController = new AbortController()
    const timeoutSpy = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeoutController.signal)

    let fetchSignal: AbortSignal | undefined
    const mockFetch = jest.fn().mockImplementation((_url, opts) => {
      fetchSignal = opts.signal
      if (opts.signal.aborted) {
        return Promise.reject(opts.signal.reason)
      }
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(opts.signal.reason))
      })
    })
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

    // Caller signal that never aborts (e.g. `next build` waiting on flush)
    const callerController = new AbortController()
    const resPromise = postNextTelemetryPayload(
      payload,
      callerController.signal
    )

    // The built-in timeout must still be installed
    expect(timeoutSpy).toHaveBeenCalledWith(5000)
    expect(fetchSignal!.aborted).toBe(false)

    // Simulate the built-in timeout firing while the caller never aborts
    timeoutController.abort()
    expect(fetchSignal!.aborted).toBe(true)

    // Errors from the aborted request are swallowed
    await resPromise

    timeoutSpy.mockRestore()
  })

  it('still aborts the request when the caller signal aborts', async () => {
    let fetchSignal: AbortSignal | undefined
    const mockFetch = jest.fn().mockImplementation((_url, opts) => {
      fetchSignal = opts.signal
      if (opts.signal.aborted) {
        return Promise.reject(opts.signal.reason)
      }
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(opts.signal.reason))
      })
    })
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

    const callerController = new AbortController()
    const resPromise = postNextTelemetryPayload(
      payload,
      callerController.signal
    )

    expect(fetchSignal!.aborted).toBe(false)

    callerController.abort()
    expect(fetchSignal!.aborted).toBe(true)

    // Errors from the aborted request are swallowed
    await resPromise
  })
})
