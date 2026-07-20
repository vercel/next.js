import type { IncomingMessage } from 'node:http'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { NextResponse } from 'next/dist/server/web/spec-extension/response'
import {
  filterWebSocketUpgradeRequestHeaders,
  getUpgradeResponseHeaders,
  validateWebSocketHandshake,
  validateWebSocketRequestPolicy,
  validateUpgradeResponseHeaders,
  writeRawHttpResponse,
} from 'next/dist/server/websocket-upgrade'
import {
  closeAllWebSockets,
  registerWebSocketPeer,
} from 'next/dist/server/websocket-connection-registry'

const { getWebSocketUpgradeMetadata } =
  require('next/dist/server/web/spec-extension/response') as {
    getWebSocketUpgradeMetadata(response: Response):
      | {
          hooks: unknown
          allowedOrigins?: readonly string[]
          protocol?: string
        }
      | undefined
  }

describe('NextResponse.upgrade()', () => {
  const originalRuntime = process.env.NEXT_RUNTIME
  const originalFlag = process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS

  afterEach(() => {
    process.env.NEXT_RUNTIME = originalRuntime
    process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS = originalFlag
  })

  it('requires the experimental flag', () => {
    delete process.env.NEXT_RUNTIME
    delete process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS

    expect(() => NextResponse.upgrade({})).toThrow(
      'experimental.webSocketRouteHandlers'
    )
  })

  it('throws a targeted Edge Runtime error', () => {
    process.env.NEXT_RUNTIME = 'edge'
    process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS = '1'

    expect(() => NextResponse.upgrade({})).toThrow(
      'not supported in the Edge Runtime'
    )
  })

  it('preserves hooks, headers, cookies, and metadata through clone()', () => {
    delete process.env.NEXT_RUNTIME
    process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS = '1'
    const hooks = { open: async () => {} }
    const response = NextResponse.upgrade(hooks, {
      allowedOrigins: ['https://client.example/'],
      protocol: 'chat.v1',
    })
    response.headers.set('x-upgrade', 'yes')
    response.cookies.set('session', 'value')

    const cloned = response.clone() as NextResponse<null>
    expect(cloned.headers.get('x-upgrade')).toBe('yes')
    expect(cloned.cookies.get('session')?.value).toBe('value')
    expect(getWebSocketUpgradeMetadata(cloned)).toEqual({
      hooks,
      allowedOrigins: ['https://client.example'],
      protocol: 'chat.v1',
    })
  })

  it('validates the hooks object and hook functions', () => {
    delete process.env.NEXT_RUNTIME
    process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS = '1'
    expect(() => NextResponse.upgrade(null as any)).toThrow('hooks object')
    expect(() => NextResponse.upgrade({ open: 'invalid' } as any)).toThrow(
      'hook "open" must be a function'
    )
    expect(() => NextResponse.upgrade({ upgrade() {} } as any)).toThrow(
      'does not support the "upgrade" hook'
    )
  })

  it('allows an empty hooks object', () => {
    delete process.env.NEXT_RUNTIME
    process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS = '1'
    const hooks = {}
    expect(getWebSocketUpgradeMetadata(NextResponse.upgrade(hooks))).toEqual({
      hooks,
    })
  })

  it('validates origin and subprotocol options', () => {
    delete process.env.NEXT_RUNTIME
    process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS = '1'

    expect(() =>
      NextResponse.upgrade({}, { allowedOrigins: ['ftp://example.test'] })
    ).toThrow('must be an HTTP(S) origin')
    expect(() =>
      NextResponse.upgrade({}, { allowedOrigins: ['https://example.test/x'] })
    ).toThrow('without credentials, path, query, or fragment')
    expect(() => NextResponse.upgrade({}, { protocol: 'not valid' })).toThrow(
      'valid WebSocket subprotocol token'
    )
    expect(() => NextResponse.upgrade({}, { unknown: true } as any)).toThrow(
      'does not support the "unknown" option'
    )
  })
})

describe('WebSocket handshake security', () => {
  function createRequest(
    headers: IncomingMessage['headers'] = {}
  ): IncomingMessage {
    return {
      method: 'GET',
      httpVersion: '1.1',
      headers: {
        host: 'example.test',
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': Buffer.alloc(16).toString('base64'),
        'sec-websocket-version': '13',
        ...headers,
      },
    } as IncomingMessage
  }

  it('uses the patched compiled WebSocket parser', () => {
    expect(require('next/dist/compiled/ws/package.json').version).toBe('8.21.1')
  })

  it('returns protocol-appropriate handshake errors', () => {
    const invalidVersion = createRequest({
      'sec-websocket-version': '12',
    })
    expect(validateWebSocketHandshake(invalidVersion)).toEqual({
      status: 426,
      message: 'Unsupported WebSocket version.',
      headers: { 'sec-websocket-version': '13' },
    })

    const invalidKey = createRequest({ 'sec-websocket-key': 'invalid' })
    expect(validateWebSocketHandshake(invalidKey)).toEqual({
      status: 400,
      message: 'Invalid Sec-WebSocket-Key header.',
    })
  })

  it('filters client-forged internal headers', () => {
    const originalTestHeaders = process.env.NEXT_PRIVATE_TEST_HEADERS
    delete process.env.NEXT_PRIVATE_TEST_HEADERS
    const request = createRequest({
      authorization: 'Bearer secret',
      'x-middleware-set-cookie': 'forged=1',
      'x-nextjs-data': 'forged',
    })

    try {
      filterWebSocketUpgradeRequestHeaders(request)
      expect(request.headers.authorization).toBe('Bearer secret')
      expect(request.headers['x-middleware-set-cookie']).toBeUndefined()
      expect(request.headers['x-nextjs-data']).toBeUndefined()
    } finally {
      if (originalTestHeaders === undefined) {
        delete process.env.NEXT_PRIVATE_TEST_HEADERS
      } else {
        process.env.NEXT_PRIVATE_TEST_HEADERS = originalTestHeaders
      }
    }
  })

  it('enforces same-host origins, exact allowlists, and offered protocols', () => {
    const sameHost = createRequest({ origin: 'https://example.test' })
    expect(
      validateWebSocketRequestPolicy(sameHost, { hooks: {} })
    ).toBeUndefined()

    const crossOrigin = createRequest({ origin: 'https://client.example' })
    expect(validateWebSocketRequestPolicy(crossOrigin, { hooks: {} })).toEqual({
      status: 403,
      message: 'WebSocket origin is not allowed.',
    })
    expect(
      validateWebSocketRequestPolicy(crossOrigin, {
        hooks: {},
        allowedOrigins: ['https://client.example'],
      })
    ).toBeUndefined()

    const protocolRequest = createRequest({
      'sec-websocket-protocol': 'other, chat',
    })
    expect(
      validateWebSocketRequestPolicy(protocolRequest, {
        hooks: {},
        protocol: 'chat',
      })
    ).toBeUndefined()
    expect(
      validateWebSocketRequestPolicy(protocolRequest, {
        hooks: {},
        protocol: 'missing',
      })
    ).toEqual({
      status: 400,
      message: 'Selected WebSocket subprotocol was not offered by the client.',
    })
  })
})

describe('writeRawHttpResponse()', () => {
  it('preserves status, repeated cookies, and chunked body framing', async () => {
    const socket = new PassThrough()
    const chunks: Buffer[] = []
    socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

    const headers = new Headers({ 'x-response': 'yes' })
    headers.append('set-cookie', 'first=1; Path=/')
    headers.append('set-cookie', 'second=2; Path=/')
    await writeRawHttpResponse(
      { method: 'GET' } as IncomingMessage,
      socket,
      new Response('hello', { status: 403, statusText: 'Forbidden', headers })
    )

    const raw = Buffer.concat(chunks).toString()
    expect(raw).toContain('HTTP/1.1 403 Forbidden\r\n')
    expect(raw).toContain('set-cookie: first=1; Path=/\r\n')
    expect(raw).toContain('set-cookie: second=2; Path=/\r\n')
    expect(raw).toContain('Transfer-Encoding: chunked\r\n')
    expect(raw).toContain('\r\n5\r\nhello\r\n0\r\n\r\n')
  })

  it('overrides conflicting application response framing', async () => {
    const socket = new PassThrough()
    const chunks: Buffer[] = []
    socket.on('data', (chunk) => chunks.push(Buffer.from(chunk)))

    await writeRawHttpResponse(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      new Response('hello', {
        headers: {
          connection: 'keep-alive',
          'content-length': '1',
          'transfer-encoding': 'identity',
        },
      })
    )

    const raw = Buffer.concat(chunks).toString()
    expect(raw).toContain('Connection: close\r\n')
    expect(raw).toContain('Transfer-Encoding: chunked\r\n')
    expect(raw).not.toContain('content-length: 1')
    expect(raw).not.toContain('transfer-encoding: identity')
    expect(raw).toContain('\r\n5\r\nhello\r\n0\r\n\r\n')
  })
})

describe('validateUpgradeResponseHeaders()', () => {
  it.each(['content-length', 'transfer-encoding'])(
    'rejects the protocol-critical %s header',
    (name) => {
      expect(() =>
        validateUpgradeResponseHeaders(
          new Response(null, { headers: { [name]: '1' } })
        )
      ).toThrow(`protocol-critical "${name}" header`)
    }
  )
})

describe('getUpgradeResponseHeaders()', () => {
  it('strips internal middleware cookie headers from the handshake response', () => {
    const headers = new Headers({
      'x-middleware-set-cookie': 'internal=1',
      'x-response': 'yes',
    })
    headers.append('set-cookie', 'public=1')

    const filtered = getUpgradeResponseHeaders(new Response(null, { headers }))

    expect(filtered.get('x-middleware-set-cookie')).toBeNull()
    expect(filtered.get('x-response')).toBe('yes')
    expect(filtered.get('set-cookie')).toContain('public=1')
  })
})

describe('WebSocket connection registry', () => {
  afterEach(async () => {
    jest.useRealTimers()
    await closeAllWebSockets()
  })

  function createPeer() {
    const websocket = new EventEmitter() as EventEmitter & {
      readyState: number
    }
    websocket.readyState = 1

    return {
      websocket,
      close: jest.fn(() => {
        websocket.readyState = 2
      }),
      terminate: jest.fn(() => {
        websocket.readyState = 3
        websocket.emit('close')
      }),
    }
  }

  it('waits for peers to close before resolving', async () => {
    const peer = createPeer()
    registerWebSocketPeer('app/ws/route', peer as any)

    const closed = closeAllWebSockets(1001)
    expect(peer.close).toHaveBeenCalledWith(1001)

    let resolved = false
    void closed.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)

    peer.websocket.readyState = 3
    peer.websocket.emit('close')
    await closed
    expect(resolved).toBe(true)
    expect(peer.terminate).not.toHaveBeenCalled()
  })

  it('terminates peers after the grace period', async () => {
    jest.useFakeTimers()
    const peer = createPeer()
    registerWebSocketPeer('app/ws/route', peer as any)

    const closed = closeAllWebSockets(1001)
    await Promise.resolve()

    jest.advanceTimersByTime(5_000)
    await closed

    expect(peer.close).toHaveBeenCalledWith(1001)
    expect(peer.terminate).toHaveBeenCalled()
  })

  it('settles shutdown when transport termination throws', async () => {
    jest.useFakeTimers()
    const peer = createPeer()
    peer.terminate.mockImplementation(() => {
      throw new Error('already failed')
    })
    registerWebSocketPeer('app/ws/route', peer as any)

    const closed = closeAllWebSockets(1001)
    await Promise.resolve()
    jest.advanceTimersByTime(5_000)

    await expect(closed).resolves.toBeUndefined()
  })

  it('isolates shutdown to the owning router-server scope', async () => {
    const scopeA = Symbol('server-a')
    const scopeB = Symbol('server-b')
    const peerA = createPeer()
    const peerB = createPeer()
    registerWebSocketPeer('app/ws/route', peerA as any, scopeA)
    registerWebSocketPeer('app/ws/route', peerB as any, scopeB)

    const closedA = closeAllWebSockets(1001, scopeA)
    expect(peerA.close).toHaveBeenCalledWith(1001)
    expect(peerB.close).not.toHaveBeenCalled()
    peerA.websocket.readyState = 3
    peerA.websocket.emit('close')
    await closedA

    const closedB = closeAllWebSockets(1001, scopeB)
    peerB.websocket.readyState = 3
    peerB.websocket.emit('close')
    await closedB
  })
})
