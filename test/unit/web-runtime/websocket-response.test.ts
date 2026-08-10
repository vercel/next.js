import { NextResponse } from 'next/server'
import type { WebSocketHooks } from 'next/dist/server/web/spec-extension/response'

const { createWebSocketUpgradeFallbackResponse } =
  require('next/dist/server/web/spec-extension/websocket-upgrade-fallback') as {
    createWebSocketUpgradeFallbackResponse(
      response: Response,
      inheritedHeaders?: Headers
    ): Response
  }
const { getWebSocketUpgradeMetadata } =
  require('next/dist/server/web/spec-extension/response') as {
    getWebSocketUpgradeMetadata(response: Response):
      | {
          readonly hooks: Readonly<WebSocketHooks>
          readonly protocol?: string
        }
      | undefined
  }

describe('NextResponse.upgrade', () => {
  const previousRuntime = process.env.NEXT_RUNTIME
  const previousFlag = process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS

  afterEach(() => {
    if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME
    else process.env.NEXT_RUNTIME = previousRuntime
    if (previousFlag === undefined) {
      delete process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS
    } else {
      process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS = previousFlag
    }
  })

  it('creates a marked response independently of the project flag', () => {
    delete process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS
    const open = jest.fn()

    const response = NextResponse.upgrade({ open }, { protocol: 'chat.v1' })

    expect(response).toBeInstanceOf(NextResponse)
    expect(response.body).toBeNull()
    expect(getWebSocketUpgradeMetadata(response)).toEqual({
      hooks: { open },
      protocol: 'chat.v1',
    })
  })

  it('snapshots hook and option accessors exactly once', () => {
    const open = jest.fn()
    const hooks = Object.create(null)
    const options = Object.create(null)
    const hookGetter = jest.fn(() => open)
    const protocolGetter = jest.fn(() => 'chat')
    Object.defineProperty(hooks, 'open', {
      enumerable: true,
      get: hookGetter,
    })
    Object.defineProperty(options, 'protocol', {
      enumerable: true,
      get: protocolGetter,
    })

    const response = NextResponse.upgrade(hooks, options)

    expect(hookGetter).toHaveBeenCalledTimes(1)
    expect(protocolGetter).toHaveBeenCalledTimes(1)
    expect(getWebSocketUpgradeMetadata(response)).toEqual({
      hooks: { open },
      protocol: 'chat',
    })
  })

  /* eslint-disable no-extend-native -- Intentionally simulate prototype pollution. */
  it('ignores supported fields inherited through Object.prototype', () => {
    const inheritedOpen = jest.fn()
    const previousOpen = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'open'
    )
    const previousProtocol = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'protocol'
    )
    Object.defineProperty(Object.prototype, 'open', {
      configurable: true,
      value: inheritedOpen,
    })
    Object.defineProperty(Object.prototype, 'protocol', {
      configurable: true,
      value: 'polluted',
    })

    try {
      const response = NextResponse.upgrade({})
      expect(getWebSocketUpgradeMetadata(response)).toEqual({ hooks: {} })
      expect(inheritedOpen).not.toHaveBeenCalled()
    } finally {
      if (previousOpen) {
        Object.defineProperty(Object.prototype, 'open', previousOpen)
      } else {
        delete (Object.prototype as any).open
      }
      if (previousProtocol) {
        Object.defineProperty(Object.prototype, 'protocol', previousProtocol)
      } else {
        delete (Object.prototype as any).protocol
      }
    }
  })
  /* eslint-enable no-extend-native */

  it('copies and freezes metadata without freezing caller-owned hooks', () => {
    const first = jest.fn()
    const second = jest.fn()
    const hooks: WebSocketHooks = { open: first }
    const response = NextResponse.upgrade(hooks)
    hooks.open = second

    const metadata = getWebSocketUpgradeMetadata(response)!
    expect(metadata.hooks.open).toBe(first)
    expect(Object.isFrozen(metadata)).toBe(true)
    expect(Object.isFrozen(metadata.hooks)).toBe(true)
    expect(Object.isFrozen(hooks)).toBe(false)
  })

  it('clones headers and cookies while preserving the immutable marker', () => {
    const response = NextResponse.upgrade({})
    response.headers.set('x-route', 'original')
    response.cookies.set('session', 'one')

    const clone = response.clone() as typeof response
    clone.headers.set('x-route', 'clone')
    clone.cookies.set('session', 'two')

    expect(getWebSocketUpgradeMetadata(clone)).toBe(
      getWebSocketUpgradeMetadata(response)
    )
    expect(response.headers.get('x-route')).toBe('original')
    expect(clone.headers.get('x-route')).toBe('clone')
    expect(response.cookies.get('session')?.value).toBe('one')
    expect(clone.cookies.get('session')?.value).toBe('two')
  })

  it.each([
    [null, 'requires a hooks object'],
    [[], 'requires a hooks object'],
    [Object.create({ open() {} }), 'requires a hooks object'],
    [{ unsupported() {} }, 'does not support the "unsupported" hook'],
    [{ open: true }, 'hook "open" must be a function'],
  ])('rejects invalid hooks %#', (hooks, message) => {
    expect(() => NextResponse.upgrade(hooks as any)).toThrow(message)
  })

  it.each([
    [null, 'options must be an object'],
    [[], 'options must be an object'],
    [Object.create({ protocol: 'chat' }), 'options must be an object'],
    [{ unsupported: true }, 'does not support the "unsupported" option'],
    [{ protocol: '' }, 'must be a valid WebSocket subprotocol token'],
    [{ protocol: 'chat,other' }, 'must be a valid WebSocket subprotocol token'],
    [{ protocol: 1 }, 'must be a valid WebSocket subprotocol token'],
  ])('rejects invalid options %#', (options, message) => {
    expect(() => NextResponse.upgrade({}, options as any)).toThrow(message)
  })

  it('rejects the Edge Runtime with a targeted error', () => {
    process.env.NEXT_RUNTIME = 'edge'
    expect(() => NextResponse.upgrade({})).toThrow(
      'NextResponse.upgrade() is not supported in the Edge Runtime.'
    )
  })
})

describe('ordinary HTTP WebSocket fallback', () => {
  it('preserves public headers and repeated cookies', () => {
    const response = NextResponse.upgrade({})
    response.headers.set('x-public', 'yes')
    response.headers.append('set-cookie', 'first=1; Path=/')
    response.headers.append('set-cookie', 'second=2; Path=/')

    const fallback = createWebSocketUpgradeFallbackResponse(response)

    expect(fallback.status).toBe(426)
    expect(fallback.headers.get('upgrade')).toBe('websocket')
    expect(fallback.headers.get('sec-websocket-version')).toBe('13')
    expect(fallback.headers.get('x-public')).toBe('yes')
    expect(fallback.headers.getSetCookie()).toEqual([
      'first=1; Path=/',
      'second=2; Path=/',
    ])
  })

  it('strips internal, framing, handshake, and nominated headers', () => {
    const response = NextResponse.upgrade({})
    response.headers.set('connection', 'x-nominated, set-cookie')
    response.headers.set('x-nominated', 'secret')
    response.headers.set('x-nextjs-test', 'internal')
    response.headers.set('x-middleware-test', 'internal')
    response.headers.set('content-length', '123')
    response.headers.set('sec-websocket-protocol', 'unsafe')
    response.headers.append('set-cookie', 'hidden=1')

    const fallback = createWebSocketUpgradeFallbackResponse(response)

    expect(fallback.headers.get('connection')).toBe('close')
    expect(fallback.headers.get('x-nominated')).toBeNull()
    expect(fallback.headers.get('x-nextjs-test')).toBeNull()
    expect(fallback.headers.get('x-middleware-test')).toBeNull()
    expect(fallback.headers.get('content-length')).not.toBe('123')
    expect(fallback.headers.get('sec-websocket-protocol')).toBeNull()
    expect(fallback.headers.getSetCookie()).toEqual([])
  })

  it('replaces stale cache, validator, and representation metadata', () => {
    const response = NextResponse.upgrade({})
    response.headers.set('cache-control', 'public, max-age=86400')
    response.headers.set('cdn-cache-control', 'public, max-age=86400')
    response.headers.set('content-range', 'bytes 0-0/1')
    response.headers.set('content-digest', 'sha-256=:unsafe:')
    response.headers.set('etag', '"upgrade-metadata"')
    response.headers.set('last-modified', new Date(0).toUTCString())
    response.headers.set('x-accel-redirect', '/private')

    const inheritedHeaders = new Headers({
      connection: 'x-routing-secret',
      'content-length': '999999',
      'x-routing-secret': 'routing-secret',
    })
    const fallback = createWebSocketUpgradeFallbackResponse(
      response,
      inheritedHeaders
    )

    expect(fallback.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(fallback.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8'
    )
    expect(fallback.headers.get('connection')).toBe('close')
    expect(fallback.headers.get('content-length')).toBe(
      String('This route only accepts WebSocket upgrade requests.'.length)
    )
    for (const name of [
      'cdn-cache-control',
      'content-range',
      'content-digest',
      'etag',
      'last-modified',
      'x-accel-redirect',
      'x-routing-secret',
    ]) {
      expect(fallback.headers.get(name)).toBeNull()
    }
  })
})
