import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { postNextTelemetryPayload } from './post-telemetry-payload'
import { Telemetry } from './storage'

// Keep identifiers and metadata local while exercising the real delivery path.
jest.mock('next/dist/compiled/conf', () =>
  jest.fn().mockImplementation(() => ({
    get: jest.fn((_key: string, fallback: unknown) => fallback),
    set: jest.fn(),
  }))
)
jest.mock('./project-id', () => ({
  getRawProjectId: async () => 'test-project',
}))
jest.mock('./anonymous-meta', () => ({
  getAnonymousMeta: async () => ({}),
}))

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

describe('Telemetry delivery', () => {
  const originalEnv = process.env
  let originalFetch: typeof fetch

  beforeEach(() => {
    originalFetch = global.fetch
    process.env = { ...originalEnv }
    delete process.env.NEXT_TELEMETRY_DISABLED
    delete process.env.NEXT_TELEMETRY_DEBUG
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = originalEnv
  })

  it('delivers recorded telemetry over HTTP', async () => {
    const requests: Array<{
      method: string | undefined
      contentType: string | undefined
      body: string
    }> = []
    const server = createServer((request, response) => {
      let body = ''
      request.on('data', (chunk) => {
        body += chunk
      })
      request.on('end', () => {
        requests.push({
          method: request.method,
          contentType: request.headers['content-type'],
          body,
        })
        response.writeHead(204)
        response.end()
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })

    try {
      // Redirect only the destination; native fetch still validates and sends.
      const address = server.address() as AddressInfo
      const mockFetch = jest.fn((_input, init) =>
        originalFetch('http://127.0.0.1:' + address.port, init)
      )
      global.fetch = mockFetch
      const telemetry = new Telemetry({ distDir: '.next', skipNotify: true })
      const event = { eventName: 'test-event', payload: { foo: 'bar' } }

      telemetry.record(event)
      await telemetry.flush()

      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({
        method: 'POST',
        contentType: 'application/json',
      })
      expect(JSON.parse(requests[0].body).events).toEqual([
        { eventName: event.eventName, fields: event.payload },
      ])
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://telemetry.nextjs.org/api/v1/record',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    }
  })
})
