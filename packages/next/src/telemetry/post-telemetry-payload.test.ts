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

  it('bypasses only the Next.js patched fetch wrapper', async () => {
    const originFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      async (_input: Parameters<typeof fetch>[0]) =>
        new Response(null, { status: 204 })
    )
    const patchedFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      (input, init) => originFetch(input, init)
    )
    Object.assign(patchedFetch, {
      __nextPatched: true,
      _nextOriginalFetch: originFetch,
    })
    global.fetch = patchedFetch

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

    expect(patchedFetch).not.toHaveBeenCalled()
    expect(originFetch).toHaveBeenCalledTimes(1)

    await global.fetch('https://telemetry.nextjs.org/api/v1/record')

    expect(patchedFetch).toHaveBeenCalledTimes(1)
    expect(originFetch).toHaveBeenCalledTimes(2)
  })

  it('does not trust an unbranded _nextOriginalFetch property', async () => {
    const unrelatedOriginalFetch = jest.fn(
      async () => new Response(null, { status: 204 })
    )
    const customFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      async (_input: Parameters<typeof fetch>[0]) =>
        new Response(null, { status: 204 })
    )
    Object.assign(customFetch, {
      _nextOriginalFetch: unrelatedOriginalFetch,
    })
    global.fetch = customFetch

    await postNextTelemetryPayload({
      meta: {},
      context: {
        anonymousId: 'test-id',
        projectId: 'test-project',
        sessionId: 'test-session',
      },
      events: [],
    })

    expect(customFetch).toHaveBeenCalledTimes(1)
    expect(unrelatedOriginalFetch).not.toHaveBeenCalled()
  })

  it('does not trust a non-callable _nextOriginalFetch property', async () => {
    const customFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      async (_input: Parameters<typeof fetch>[0]) =>
        new Response(null, { status: 204 })
    )
    Object.assign(customFetch, {
      __nextPatched: true,
      _nextOriginalFetch: 'not a function',
    })
    global.fetch = customFetch

    await postNextTelemetryPayload({
      meta: {},
      context: {
        anonymousId: 'test-id',
        projectId: 'test-project',
        sessionId: 'test-session',
      },
      events: [],
    })

    expect(customFetch).toHaveBeenCalledTimes(1)
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
})
