import http from 'node:http'
import path from 'node:path'

import WebSocket from 'ws'
import { retry } from 'next-test-utils'
import { requestWebSocketUpgrade } from 'next-websocket-test-utils'
import { nextTestSetup } from 'e2e-utils'

const describeWithoutCacheComponents =
  process.env.__NEXT_CACHE_COMPONENTS === 'true' ? describe.skip : describe
const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('WebSocket Route Handlers', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) return

  beforeAll(async () => {
    if (isCacheComponentsEnabled) {
      // Cache Components does not support explicit route runtime config. The
      // Edge-specific contract remains covered by every regular test mode.
      await next.deleteFile('app/edge/route.ts')
    }
    await next.start()
  })

  function connect(
    requestPath = '/ws',
    protocols?: string | string[],
    options: { headers?: Record<string, string>; origin?: string } = {}
  ) {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const connected = new Promise<{
      socket: WebSocket
      response: http.IncomingMessage
      firstMessage: string
    }>((resolve, reject) => {
      const socket = new WebSocket(
        `ws://localhost:${next.appPort}${requestPath}`,
        protocols,
        {
          ...options,
          headers: {
            authorization: 'Bearer secret',
            ...options.headers,
          },
        }
      )
      let response: http.IncomingMessage
      socket.once('upgrade', (upgradeResponse) => {
        response = upgradeResponse
      })
      socket.once('message', (data) => {
        resolve({ socket, response, firstMessage: data.toString() })
      })
      socket.once('error', reject)
    })
    // Fail fast with diagnostics instead of hanging to the suite timeout when
    // the first message never arrives.
    const bounded = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Timed out waiting for the first WebSocket message from ${requestPath}`
            )
          ),
        10_000
      )
    })
    return Promise.race([connected, bounded]).finally(() =>
      clearTimeout(timeout)
    )
  }

  function nextMessage(socket: WebSocket) {
    return new Promise<{ data: Buffer; isBinary: boolean }>((resolve) => {
      socket.once('message', (data, isBinary) => {
        resolve({ data: Buffer.from(data as Buffer), isBinary })
      })
    })
  }

  async function closeWebSocket(socket: WebSocket) {
    if (socket.readyState === WebSocket.CLOSED) return
    const closed = new Promise<void>((resolve) => socket.once('close', resolve))
    if (socket.readyState === WebSocket.CONNECTING) {
      socket.once('open', () => socket.close())
    } else {
      socket.close()
    }
    await closed
  }

  it('executes GET once and exposes the request, peer, headers, and cookies', async () => {
    const accepted = await connect('/ws?execution-key=once&request-check=1')
    try {
      expect(JSON.parse(accepted.firstMessage)).toEqual({
        executions: 1,
        sameSignal: true,
        url: expect.stringContaining('/ws?execution-key=once&request-check=1'),
        remoteAddress: expect.any(String),
        bufferedAmount: 0,
      })
      expect(accepted.response.statusCode).toBe(101)
      expect(accepted.response.headers['x-response-layer']).toBe('handler')
      expect(accepted.response.headers['x-proxy-result']).toBe('continued')
      expect(accepted.response.headers['x-routing-secret']).toBeUndefined()
      expect(accepted.response.headers['content-length']).toBeUndefined()
      expect(accepted.response.headers['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringContaining('proxy-cookie=present'),
          expect.stringContaining('websocket=accepted'),
        ])
      )

      const echoed = nextMessage(accepted.socket)
      accepted.socket.send('hello')
      expect((await echoed).data.toString()).toBe('hello')
    } finally {
      await closeWebSocket(accepted.socket)
    }
  })

  it('isolates request cookies when a module-scoped response is reused', async () => {
    const key = `shared-${Date.now()}`
    const first = await connect(`/ws?shared=${key}&request-cookie=first`)
    expect(first.response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('request-cookie=first')])
    )
    await closeWebSocket(first.socket)

    const second = await connect(`/ws?shared=${key}&request-cookie=second`)
    try {
      const cookies = second.response.headers['set-cookie']?.join(';') || ''
      expect(cookies).toContain('request-cookie=second')
      expect(cookies).not.toContain('request-cookie=first')
    } finally {
      await closeWebSocket(second.socket)
    }
  })

  it('serializes an ordinary response when the handler declines', async () => {
    const response = await requestWebSocketUpgrade(next, '/ws?decline=1', {
      headers: { authorization: 'Bearer secret' },
    })
    expect(response).toMatchObject({
      status: 401,
      body: 'declined',
      headers: {
        connection: 'close',
        'x-response-layer': 'handler-decline',
        'x-proxy-result': 'continued',
      },
    })
    expect(response.headers['content-length']).toBeUndefined()
    expect(response.headers['x-routing-secret']).toBeUndefined()
  })

  it('rejects malformed handshakes before the App Route and framing before proxy', async () => {
    const key = `malformed-${Date.now()}`
    const invalidKey = await requestWebSocketUpgrade(
      next,
      `/ws?execution-key=${key}&reject-if-proxy-runs=1`,
      {
        headers: {
          authorization: 'Bearer secret',
          'sec-websocket-key': 'invalid',
        },
      }
    )
    expect(invalidKey.status).toBe(400)
    expect(invalidKey.body).toContain('Invalid Sec-WebSocket-Key')

    const invalidVersion = await requestWebSocketUpgrade(
      next,
      `/ws?execution-key=${key}&reject-if-proxy-runs=1`,
      {
        headers: {
          authorization: 'Bearer secret',
          'sec-websocket-version': '12',
        },
      }
    )
    expect(invalidVersion.status).toBe(426)
    expect(invalidVersion.headers['sec-websocket-version']).toBe('13')

    const framed = await requestWebSocketUpgrade(
      next,
      `/ws?execution-key=${key}&reject-if-proxy-runs=1`,
      {
        headers: {
          authorization: 'Bearer secret',
          'content-length': '1',
        },
      }
    )
    expect(framed.status).toBe(400)
    expect(framed.body).toContain('cannot include HTTP body framing')

    const state = await next.fetch(`/state?key=${key}`)
    expect(await state.json()).toEqual({ executions: 0 })
  })

  it('returns 404 for WebSockets claimed by non-Node App Routes', async () => {
    for (const requestPath of ['/', '/missing-websocket']) {
      const response = await requestWebSocketUpgrade(next, requestPath)
      expect(response).toMatchObject({ status: 404, body: 'Not Found' })
      expect(response.headers['cache-control']).toContain('no-store')
    }
  })

  it('filters forged internal headers while preserving proxy cookies', async () => {
    const accepted = await connect('/ws?header-check=1', undefined, {
      headers: {
        'x-middleware-set-cookie': 'forged=attacker; Path=/',
        'x-nextjs-data': 'forged',
      },
    })
    try {
      expect(JSON.parse(accepted.firstMessage)).toEqual({
        internalCookieHeader: expect.stringContaining('proxy-cookie=present'),
        nextDataHeader: null,
        forgedCookie: null,
      })
      const cookies = accepted.response.headers['set-cookie']?.join(';') || ''
      expect(cookies).toContain('proxy-cookie=present')
      expect(cookies).not.toContain('forged=attacker')
    } finally {
      await closeWebSocket(accepted.socket)
    }
  })

  it('enforces App Route origin policy before route execution', async () => {
    const sameOrigin = await connect('/ws', undefined, {
      origin: `http://localhost:${next.appPort}`,
    })
    await closeWebSocket(sameOrigin.socket)

    const key = `origin-${Date.now()}`
    const rejected = await requestWebSocketUpgrade(
      next,
      `/ws?execution-key=${key}&strip-origin-in-proxy=1&reject-if-proxy-runs=1`,
      {
        headers: {
          authorization: 'Bearer secret',
          origin: 'https://attacker.example',
        },
      }
    )
    expect(rejected).toMatchObject({
      status: 403,
      body: 'WebSocket origin is not allowed.',
    })
    expect(rejected.headers['x-proxy-result']).toBeUndefined()
    const state = await next.fetch(`/state?key=${key}`)
    expect(await state.json()).toEqual({ executions: 0 })
  })

  it('allows exact configured origins and selects an offered protocol', async () => {
    const accepted = await connect('/ws?protocol=chat', ['other', 'chat'], {
      origin: 'https://client.example',
    })
    expect(accepted.socket.protocol).toBe('chat')
    await closeWebSocket(accepted.socket)

    const rejected = await requestWebSocketUpgrade(
      next,
      '/ws?protocol=required',
      {
        headers: { authorization: 'Bearer secret' },
      }
    )
    expect(rejected.status).toBe(400)
    expect(rejected.body).toContain('not offered by the client')
  })

  it('rejects NextResponse.upgrade() returned from proxy.ts', async () => {
    const response = await requestWebSocketUpgrade(
      next,
      '/ws?proxy-upgrade=1',
      {
        headers: { authorization: 'Bearer secret' },
      }
    )
    expect(response.status).toBe(500)
  })

  it('applies rewrites before selecting the App Route', async () => {
    const accepted = await connect('/socket?execution-key=rewrite')
    try {
      expect(accepted.firstMessage).toBe('connected:1')
    } finally {
      await closeWebSocket(accepted.socket)
    }
  })

  it('keeps an automatic upgrade route dynamic and uncached', async () => {
    const first = await connect('/auto')
    expect(first.firstMessage).toBe('auto:1')
    await closeWebSocket(first.socket)

    const second = await connect('/auto')
    try {
      expect(second.firstMessage).toBe('auto:2')
    } finally {
      await closeWebSocket(second.socket)
    }
  })

  it('preserves Route Handler semantics across a proxy rewrite', async () => {
    const path = '/socket/room-42?client=present'
    const response = await next.fetch(path)
    expect(response.status).toBe(200)
    const expected = await response.json()
    expect(expected).toMatchObject({
      id: 'room-42',
      client: 'present',
      from: null,
    })

    const accepted = await connect(path)
    try {
      expect(JSON.parse(accepted.firstMessage)).toEqual(expected)
      expect(accepted.response.headers['x-middleware-rewrite']).toBeUndefined()
      expect(accepted.response.headers['x-nextjs-rewrite']).toBeUndefined()
    } finally {
      await closeWebSocket(accepted.socket)
    }
  })

  it('fails closed before proxying an external WebSocket rewrite', async () => {
    const response = await requestWebSocketUpgrade(next, '/external-socket')
    expect(response).toMatchObject({
      status: 501,
      body: 'External WebSocket rewrite targets are not proxied while experimental.webSocketRouteHandlers is enabled.',
    })
  })

  it('serializes config redirects when Next.js exclusively owns the socket', async () => {
    const response = await requestWebSocketUpgrade(next, '/old-socket')
    expect(response.status).toBe(307)
    expect(response.headers.location).toBe('/ws')
  })

  it('reports a detached hook error once after the 101 response', async () => {
    const message = `detached-hook-${Date.now()}`
    const outputIndex = next.cliOutput.length
    const accepted = await connect(`/ws?hook-error=${message}`)
    expect(accepted.response.statusCode).toBe(101)
    const close = new Promise<number>((resolve) => {
      accepted.socket.once('close', (code) => resolve(code))
    })
    expect(await close).toBe(1011)

    await retry(() => {
      const reports = next.cliOutput
        .slice(outputIndex)
        .split('\n')
        .filter(
          (line) =>
            line.includes('[websocket-on-request-error]') &&
            line.includes(message)
        )
      expect(reports).toHaveLength(1)
    })
  })

  it('does not retain the request store in long-lived hooks', async () => {
    const accepted = await connect('/ws?request-store-error=1')
    const close = new Promise<number>((resolve) => {
      accepted.socket.once('close', (code) => resolve(code))
    })
    expect(await close).toBe(1011)
  })

  it('returns a sanitized 426 response for ordinary HTTP invocation', async () => {
    const response = await next.fetch('/ws', {
      headers: { authorization: 'Bearer secret' },
    })
    expect(response.status).toBe(426)
    expect(response.headers.get('connection')).toBe('close')
    expect(response.headers.get('upgrade')).toBe('websocket')
    expect(response.headers.get('sec-websocket-version')).toBe('13')
    expect(response.headers.get('content-length')).not.toBe('999999')
    expect(response.headers.get('x-routing-secret')).toBeNull()
    expect(await response.text()).toBe(
      'This route only accepts WebSocket upgrade requests.'
    )

    if (!isCacheComponentsEnabled) {
      const edgeResponse = await next.fetch('/edge')
      expect(await edgeResponse.text()).toBe('edge route')
    }
  })
  describeWithoutCacheComponents('Edge Route contract', () => {
    it('keeps the Edge route functional without claiming its upgrades', async () => {
      const upgradeResponse = await requestWebSocketUpgrade(next, '/edge')
      expect(upgradeResponse).toMatchObject({ status: 404, body: 'Not Found' })

      const response = await next.fetch('/edge')
      expect(await response.text()).toBe('edge route')
    })
  })
})

describe('WebSocket Route Handlers disabled', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/disabled'),
  })

  it('fails closed when a route returns an upgrade marker', async () => {
    const outputIndex = next.cliOutput.length
    const response = await next.fetch('/ws')
    expect(response.status).toBe(500)
    await retry(() => {
      expect(next.cliOutput.slice(outputIndex)).toContain(
        'experimental.webSocketRouteHandlers is not enabled'
      )
    })
  })
})

describeWithoutCacheComponents(
  'WebSocket Route Handler static contracts',
  () => {
    const { next, isNextDev, skipped } = nextTestSetup({
      files: path.join(__dirname, 'fixtures/force-static'),
      skipStart: true,
      // The force-static build contract is not verifiable when deployed.
      skipDeployment: true,
    })

    if (skipped) return

    // These are production build contracts; there is no build in dev mode.
    const describeProductionContract = isNextDev ? describe.skip : describe
    describeProductionContract('production build contract', () => {
      it('rejects NextResponse.upgrade() from a force-static route', async () => {
        const { exitCode } = await next.build()

        expect(exitCode).toBe(1)
        expect(next.cliOutput).toContain(
          'NextResponse.upgrade() cannot be used in a route configured with dynamic = "force-static".'
        )
      })
    })
  }
)

describe('WebSocket Route Handler Cache Components contract', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/cache-components'),
    skipStart: true,
    // The cache-components static contract is not verifiable when deployed.
    skipDeployment: true,
  })

  if (skipped) return

  // These are production runtime contracts; dev mode has no static contract.
  const describeProductionContract = isNextDev ? describe.skip : describe
  describeProductionContract('production runtime contract', () => {
    beforeAll(async () => {
      await next.start()
    })

    it('does not cache an asynchronously returned upgrade marker', async () => {
      const response = await next.fetch('/ws')
      expect(response.status).toBe(426)
      expect(await response.text()).toBe(
        'This route only accepts WebSocket upgrade requests.'
      )

      const socket = new WebSocket(`ws://localhost:${next.appPort}/ws`)
      const message = await new Promise<string>((resolve, reject) => {
        socket.once('message', (data) => resolve(data.toString()))
        socket.once('error', reject)
      })
      expect(message).toBe('cache-components')

      const closed = new Promise<void>((resolve) =>
        socket.once('close', resolve)
      )
      socket.close()
      await closed
    })
  })

  // The dev runtime path (bundler, hook dispatch, lease lifecycle) still
  // applies under Cache Components and must accept/closing handshakes.
  const describeDevContract = isNextDev ? describe : describe.skip
  describeDevContract('development runtime contract', () => {
    beforeAll(async () => {
      await next.start()
    })

    it('accepts and closes a WebSocket route with cache components enabled', async () => {
      const response = await next.fetch('/ws')
      expect(response.status).toBe(426)
      expect(await response.text()).toBe(
        'This route only accepts WebSocket upgrade requests.'
      )

      const socket = new WebSocket(`ws://localhost:${next.appPort}/ws`)
      const message = await new Promise<string>((resolve, reject) => {
        socket.once('message', (data) => resolve(data.toString()))
        socket.once('error', reject)
      })
      expect(message).toBe('cache-components')

      const closed = new Promise<void>((resolve) =>
        socket.once('close', resolve)
      )
      socket.close()
      await closed
    })
  })
})
