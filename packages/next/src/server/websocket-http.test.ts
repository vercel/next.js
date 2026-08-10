import type { IncomingMessage } from 'node:http'
import { EventEmitter, once } from 'node:events'
import { connect as connectTcp, createServer, type Socket } from 'node:net'
import { PassThrough } from 'node:stream'

import {
  filterInternalHeaders,
  filterInternalRawHeaders,
} from './lib/server-ipc/utils'
import {
  filterWebSocketUpgradeRequestHeaders,
  getRawHttpResponseStatus,
  isWebSocketClientDisconnectError,
  markRawHttpResponseCommitted,
  ownWebSocketUpgradeSocketErrors,
  validateWebSocketHandshake,
  validateWebSocketOrigin,
  writeRawHttpError,
  writeRawHttpResponse,
} from './websocket-http'
import {
  classifyWebSocketUpgradeOwnership,
  createWebSocketUpgradeListenerOwnershipTracker,
  markNextOwnedWebSocketUpgradeListener,
} from './websocket-upgrade-listener'
import { PendingWebSocketUpgradeTracker } from './websocket-lifecycle'

describe('WebSocket upgrade listener ownership', () => {
  it.each([
    [undefined, 'shared'],
    [[], 'shared'],
  ] as const)(
    'fails closed for opaque listener state %#',
    (listeners, owner) => {
      expect(classifyWebSocketUpgradeOwnership(listeners, jest.fn())).toBe(
        owner
      )
    }
  )

  it('classifies exclusive, coordinated, duplicate-own, and shared dispatch', () => {
    const own = jest.fn()
    const automatic = jest.fn()
    const outer = jest.fn()

    expect(classifyWebSocketUpgradeOwnership([own], own)).toBe('exclusive')
    expect(classifyWebSocketUpgradeOwnership([outer], own)).toBe('coordinated')
    expect(classifyWebSocketUpgradeOwnership([own, own], own)).toBe('exclusive')
    expect(classifyWebSocketUpgradeOwnership([own, outer], own)).toBe('shared')
    expect(classifyWebSocketUpgradeOwnership([outer, jest.fn()], own)).toBe(
      'shared'
    )
    expect(
      classifyWebSocketUpgradeOwnership([automatic, outer], own, [automatic])
    ).toBe('coordinated')
    expect(
      classifyWebSocketUpgradeOwnership([automatic, own], own, [automatic])
    ).toBe('exclusive')
  })

  it.each(['on', 'once', 'prependListener', 'prependOnceListener'] as const)(
    'permanently delegates after an external %s listener is registered',
    (method) => {
      const server = new EventEmitter()
      const ownListener = jest.fn()
      const externalListener = jest.fn()
      const { getOwnership } = createWebSocketUpgradeListenerOwnershipTracker(
        server,
        ownListener
      )

      server.on('upgrade', ownListener)
      expect(getOwnership()).toBe('exclusive')

      server[method]('upgrade', externalListener)
      server.emit('upgrade')
      server.removeListener('upgrade', externalListener)

      expect(server.listeners('upgrade')).toEqual([ownListener])
      expect(getOwnership()).toBe('shared')
    }
  )

  it('seeds existing listeners', () => {
    const server = new EventEmitter()
    const externalListener = jest.fn()
    const ownListener = jest.fn()

    server.on('upgrade', externalListener)
    const { getOwnership } = createWebSocketUpgradeListenerOwnershipTracker(
      server,
      ownListener
    )
    server.on('upgrade', ownListener)
    server.removeListener('upgrade', externalListener)

    expect(getOwnership()).toBe('shared')
  })

  it('accepts duplicate copies of one Next listener but rejects distinct listeners', () => {
    const duplicateServer = new EventEmitter()
    const duplicateListener = jest.fn()
    const { getOwnership: getDuplicateOwnership } =
      createWebSocketUpgradeListenerOwnershipTracker(
        duplicateServer,
        duplicateListener
      )
    duplicateServer.on('upgrade', duplicateListener)
    expect(getDuplicateOwnership()).toBe('exclusive')
    duplicateServer.on('upgrade', duplicateListener)
    expect(getDuplicateOwnership()).toBe('exclusive')

    const sharedServer = new EventEmitter()
    const firstOwnListener = jest.fn()
    const secondOwnListener = jest.fn()
    const { getOwnership: getFirstOwnership } =
      createWebSocketUpgradeListenerOwnershipTracker(
        sharedServer,
        firstOwnListener
      )
    sharedServer.on('upgrade', firstOwnListener)
    const { getOwnership: getSecondOwnership } =
      createWebSocketUpgradeListenerOwnershipTracker(
        sharedServer,
        secondOwnListener
      )
    sharedServer.on('upgrade', secondOwnListener)

    expect(getFirstOwnership()).toBe('shared')
    expect(getSecondOwnership()).toBe('shared')
  })

  it('coordinates listeners owned by distinct Next.js instances', () => {
    const server = new EventEmitter()
    const firstListener = markNextOwnedWebSocketUpgradeListener(jest.fn())
    const secondListener = markNextOwnedWebSocketUpgradeListener(jest.fn())
    const { getOwnership: getFirstOwnership } =
      createWebSocketUpgradeListenerOwnershipTracker(server, firstListener)
    server.on('upgrade', firstListener)
    const { getOwnership: getSecondOwnership } =
      createWebSocketUpgradeListenerOwnershipTracker(server, secondListener)
    server.on('upgrade', secondListener)

    expect(getFirstOwnership()).toBe('coordinated')
    expect(getSecondOwnership()).toBe('coordinated')
  })

  it('recognizes distinct automatic and public Next listeners as one owner', () => {
    const server = new EventEmitter()
    const automaticListener = jest.fn()
    const publicListener = jest.fn()
    const externalListener = jest.fn()
    const { getOwnership } = createWebSocketUpgradeListenerOwnershipTracker(
      server,
      automaticListener,
      [publicListener]
    )

    server.on('upgrade', automaticListener)
    server.on('upgrade', publicListener)
    expect(getOwnership()).toBe('exclusive')

    server.on('upgrade', externalListener)
    expect(getOwnership()).toBe('shared')
  })

  it('disposes its new-listener observer', () => {
    const server = new EventEmitter()
    const ownListener = jest.fn()
    const baseline = server.listenerCount('newListener')
    const tracker = createWebSocketUpgradeListenerOwnershipTracker(
      server,
      ownListener
    )

    expect(server.listenerCount('newListener')).toBe(baseline + 1)
    tracker.dispose()
    tracker.dispose()

    expect(server.listenerCount('newListener')).toBe(baseline)
    expect(tracker.getOwnership()).toBe('shared')
  })
})

describe('pending WebSocket upgrade lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('memoizes close and synchronously rejects later admission', async () => {
    const tracker = new PendingWebSocketUpgradeTracker()
    const firstClose = tracker.closePending()
    const lateSocket = new PassThrough()

    expect(tracker.closePending()).toBe(firstClose)
    tracker.track(lateSocket)
    expect(lateSocket.destroyed).toBe(true)
    await expect(firstClose).resolves.toBeUndefined()
  })

  it('lets an admitted handler finish during the bounded grace period', async () => {
    jest.useFakeTimers()
    const tracker = new PendingWebSocketUpgradeTracker()
    const socket = new PassThrough()
    const finish = tracker.track(socket)

    const close = tracker.closePending()
    jest.advanceTimersByTime(4_999)
    await Promise.resolve()
    expect(socket.destroyed).toBe(false)

    finish()
    await expect(close).resolves.toBeUndefined()
    expect(socket.destroyed).toBe(false)
    socket.destroy()
  })

  it('gives a committed response bounded grace before forcing close', async () => {
    jest.useFakeTimers()
    const tracker = new PendingWebSocketUpgradeTracker()
    const socket = new PassThrough()
    markRawHttpResponseCommitted(socket, 101)
    tracker.track(socket)

    const close = tracker.closePending()
    jest.advanceTimersByTime(4_999)
    await Promise.resolve()
    expect(socket.destroyed).toBe(false)

    jest.advanceTimersByTime(1)
    await expect(close).resolves.toBeUndefined()
    expect(socket.destroyed).toBe(true)
  })

  it('does not truncate a response ending before its commit marker', async () => {
    const tracker = new PendingWebSocketUpgradeTracker()
    const socket = new PassThrough()
    tracker.track(socket)
    socket.end('upstream response')

    const close = tracker.closePending()

    expect(socket.writableEnded).toBe(true)
    expect(socket.destroyed).toBe(false)
    socket.destroy()
    await expect(close).resolves.toBeUndefined()
  })

  it('removes listeners inserted after a reentrant terminal event', async () => {
    const tracker = new PendingWebSocketUpgradeTracker()
    const socket = new PassThrough()
    socket.on('newListener', (event) => {
      if (event === 'close') socket.emit('end')
    })

    tracker.track(socket)

    expect(socket.destroyed).toBe(true)
    expect(socket.listenerCount('end')).toBe(0)
    expect(socket.listenerCount('close')).toBe(0)
    await expect(tracker.closePending()).resolves.toBeUndefined()
  })
})

function failNextListenerRemoval(
  socket: PassThrough,
  targetEvent: string,
  failure: Error
): void {
  const off = socket.off
  let pending = true
  socket.off = function (event, listener) {
    off.call(this, event, listener)
    if (pending && event === targetEvent) {
      pending = false
      throw failure
    }
    return this
  }
}

describe('internal upgrade header filtering', () => {
  it('matches header names case-insensitively across parsed and raw forms', () => {
    const parsed = {
      'X-Middleware-Set-Cookie': 'forged=1',
      'x-user-header': 'preserved',
    }
    const raw = [
      'X-Middleware-Set-Cookie',
      'forged=1',
      'X-User-Header',
      'preserved',
    ]

    filterInternalHeaders(parsed)
    filterInternalRawHeaders(raw)

    expect(parsed).toEqual({ 'x-user-header': 'preserved' })
    expect(raw).toEqual(['X-User-Header', 'preserved'])
  })
})

describe('raw WebSocket upgrade responses', () => {
  it('preserves trusted routing headers after the ingress filter has run', () => {
    const req = {
      headers: {
        connection: 'Upgrade, X-End-To-End, "quoted"',
        'proxy-connection': 'X-Proxy-End-To-End',
        'x-end-to-end': 'preserved',
        'x-middleware-set-cookie': 'forged=attacker',
        'x-proxy-end-to-end': 'preserved-by-proxy-nomination',
      },
      headersDistinct: {
        connection: ['Upgrade, X-End-To-End, "quoted"'],
        'proxy-connection': ['X-Proxy-End-To-End'],
        'x-end-to-end': ['preserved'],
        'x-middleware-set-cookie': ['forged=attacker'],
        'x-proxy-end-to-end': ['preserved-by-proxy-nomination'],
      },
      rawHeaders: [
        'Connection',
        'Upgrade, X-End-To-End, "quoted"',
        'Proxy-Connection',
        'X-Proxy-End-To-End',
        'X-End-To-End',
        'preserved',
        'X-Middleware-Set-Cookie',
        'forged=attacker',
        'X-Proxy-End-To-End',
        'preserved-by-proxy-nomination',
      ],
    } as unknown as IncomingMessage

    filterWebSocketUpgradeRequestHeaders(req)
    expect(req.headers['x-middleware-set-cookie']).toBeUndefined()
    expect(req.headersDistinct?.['x-middleware-set-cookie']).toBeUndefined()
    expect(req.headers).toMatchObject({
      connection: 'Upgrade, X-End-To-End, "quoted"',
      'proxy-connection': 'X-Proxy-End-To-End',
      'x-end-to-end': 'preserved',
      'x-proxy-end-to-end': 'preserved-by-proxy-nomination',
    })
    expect(req.headersDistinct).toMatchObject({
      connection: ['Upgrade, X-End-To-End, "quoted"'],
      'proxy-connection': ['X-Proxy-End-To-End'],
      'x-end-to-end': ['preserved'],
      'x-proxy-end-to-end': ['preserved-by-proxy-nomination'],
    })
    expect(req.rawHeaders).toEqual([
      'Connection',
      'Upgrade, X-End-To-End, "quoted"',
      'Proxy-Connection',
      'X-Proxy-End-To-End',
      'X-End-To-End',
      'preserved',
      'X-Proxy-End-To-End',
      'preserved-by-proxy-nomination',
    ])

    req.headers['x-middleware-set-cookie'] = 'trusted=router'
    let isolatedHelpers!: typeof import('./websocket-http')
    jest.isolateModules(() => {
      isolatedHelpers =
        require('./websocket-http') as typeof import('./websocket-http')
    })
    isolatedHelpers.filterWebSocketUpgradeRequestHeaders(req)
    expect(req.headers['x-middleware-set-cookie']).toBe('trusted=router')
  })

  it('writes ordinary raw response headers with HTTP Latin-1 bytes', async () => {
    const socket = new PassThrough()
    const output: Buffer[] = []
    socket.on('data', (chunk) => output.push(chunk))

    await writeRawHttpResponse(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      new Response(null, {
        status: 299,
        statusText: 'café',
        headers: { 'x-name': 'café' },
      })
    )

    const bytes = Buffer.concat(output)
    expect(bytes.subarray(0, 19)).toEqual(
      Buffer.from('HTTP/1.1 299 café\r\n', 'latin1')
    )
    expect(bytes.includes(Buffer.from('x-name: café\r\n', 'latin1'))).toBe(true)
    expect(bytes.includes(Buffer.from('x-name: café\r\n', 'utf8'))).toBe(false)
  })

  it('strips fields nominated by Connection metadata from a raw response', async () => {
    const socket = new PassThrough()
    const output: Buffer[] = []
    socket.on('data', (chunk) => output.push(Buffer.from(chunk)))

    await writeRawHttpResponse(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      new Response(null, {
        status: 204,
        headers: {
          connection:
            'keep-alive, X-Hop-Secret , not valid, x-shared, x-hop-secret',
          'proxy-connection': 'keep-alive, X-Proxy-Hop, x-shared',
          'x-hop-secret': 'downstream-only',
          'x-proxy-hop': 'upstream-only',
          'x-shared': 'hop-only',
          'x-public': 'yes',
        },
      })
    )

    const raw = Buffer.concat(output).toString('latin1').toLowerCase()
    expect(raw).toContain('x-public: yes\r\n')
    expect(raw).not.toContain('x-hop-secret:')
    expect(raw).not.toContain('x-proxy-hop:')
    expect(raw).not.toContain('x-shared:')
  })

  it('cancels an ordinary response body when header validation fails before commit', async () => {
    const cancel = jest.fn()
    const response = new Response(null, {
      headers: { 'x-invalid': 'value\u0001control' },
    })
    Object.defineProperty(response, 'body', {
      value: new ReadableStream<Uint8Array>({ cancel }),
    })
    const socket = new PassThrough()
    const output: Buffer[] = []
    socket.on('data', (chunk) => output.push(Buffer.from(chunk)))

    await expect(
      writeRawHttpResponse(
        { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
        socket,
        response
      )
    ).rejects.toThrow()

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(getRawHttpResponseStatus(socket)).toBeUndefined()
    expect(Buffer.concat(output)).toHaveLength(0)
    socket.destroy()
  })

  it('rejects an already locked response body before committing bytes', async () => {
    const response = new Response(new ReadableStream<Uint8Array>())
    const competingReader = response.body!.getReader()
    const socket = new PassThrough()
    const output: Buffer[] = []
    socket.on('data', (chunk) => output.push(Buffer.from(chunk)))

    try {
      await expect(
        writeRawHttpResponse(
          { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
          socket,
          response
        )
      ).rejects.toThrow(/locked/i)

      expect(getRawHttpResponseStatus(socket)).toBeUndefined()
      expect(Buffer.concat(output)).toHaveLength(0)
      expect(socket.destroyed).toBe(false)
      expect(socket.writableEnded).toBe(false)
    } finally {
      competingReader.releaseLock()
      socket.destroy()
    }
  })

  it('takes response body ownership before another reader can race the first write', async () => {
    let finishBody!: () => void
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let finished = false
        finishBody = () => {
          if (finished) return
          finished = true
          controller.close()
        }
      },
    })
    const response = new Response(body)
    const socket = new PassThrough()
    socket.resume()

    const responseWrite = writeRawHttpResponse(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      response
    )
    try {
      expect(response.body!.locked).toBe(true)
      expect(() => response.body!.getReader()).toThrow(/locked/i)
      finishBody()
      await responseWrite
      expect(response.body!.locked).toBe(false)
    } finally {
      finishBody()
      socket.destroy()
      await responseWrite.catch(() => {})
    }
  })

  it.each([
    ['HEAD', 200, false],
    ['GET', 204, false],
    ['GET', 205, true],
    ['GET', 304, false],
  ])(
    'cancels a body which cannot be sent for a %s %s response',
    async (method, status, hasZeroLength) => {
      const cancel = jest.fn()
      const body = new ReadableStream<Uint8Array>({ cancel })
      const response = new Response(null, { status })
      Object.defineProperty(response, 'body', { value: body })
      const socket = new PassThrough()
      let output = ''
      socket.setEncoding('utf8')
      socket.on('data', (chunk) => {
        output += chunk
      })

      await writeRawHttpResponse(
        { method, httpVersion: '1.1' } as IncomingMessage,
        socket,
        response
      )

      expect(cancel).toHaveBeenCalledTimes(1)
      expect(output).toContain(`HTTP/1.1 ${status} `)
      expect(output.includes('Content-Length: 0\r\n')).toBe(hasZeroLength)
      expect(output).not.toContain('Transfer-Encoding:')
      expect(output.endsWith('\r\n\r\n')).toBe(true)
    }
  )

  it('does not fail an already written response when body cancellation fails', async () => {
    const cancel = jest.fn(() => {
      throw new Error('cancel failed')
    })
    const response = new Response(null, { status: 204 })
    Object.defineProperty(response, 'body', {
      value: new ReadableStream<Uint8Array>({ cancel }),
    })
    const socket = new PassThrough()
    socket.resume()

    await expect(
      writeRawHttpResponse(
        { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
        socket,
        response
      )
    ).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(getRawHttpResponseStatus(socket)).toBe(204)
  })

  it('does not wait for body cancellation before closing the raw socket', async () => {
    let finishCancellation!: () => void
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve
    })
    const cancel = jest.fn(() => cancellation)
    const response = new Response(null, { status: 204 })
    Object.defineProperty(response, 'body', {
      value: new ReadableStream<Uint8Array>({ cancel }),
    })
    const socket = new PassThrough()
    socket.resume()
    let responseFinished = false

    const responseFinishedPromise = writeRawHttpResponse(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      response
    ).then(() => {
      responseFinished = true
    })

    await new Promise<void>((resolve) => setImmediate(resolve))
    try {
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(responseFinished).toBe(true)
      expect(socket.destroyed).toBe(true)
    } finally {
      finishCancellation()
      await responseFinishedPromise
    }
  })

  it('does not commit a response after the peer ends the raw socket', async () => {
    const socket = new PassThrough({ allowHalfOpen: true })
    socket.resume()
    const ended = once(socket, 'end')
    socket.push(null)
    await ended

    await expect(
      writeRawHttpError(
        { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
        socket,
        500,
        'Internal Server Error'
      )
    ).rejects.toThrow('WebSocket upgrade client disconnected.')
    expect(getRawHttpResponseStatus(socket)).toBeUndefined()
    expect(socket.readableEnded).toBe(true)
    socket.destroy()
  })

  it('brands a synchronous socket write failure after exactly one commit', async () => {
    const failure = new Error('synchronous raw socket write failed')
    class ThrowingSocket extends PassThrough {
      override write(): boolean {
        throw failure
      }
    }

    const socket = new ThrowingSocket()
    const responseWrite = writeRawHttpError(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      400,
      'Bad Request'
    )

    await expect(responseWrite).rejects.toBe(failure)
    expect(isWebSocketClientDisconnectError(failure)).toBe(true)
    expect(getRawHttpResponseStatus(socket)).toBe(400)
    expect(socket.destroyed).toBe(true)
    expect(() => markRawHttpResponseCommitted(socket, 500)).toThrow(
      'already committed with status 400'
    )
  })

  it('settles a backpressured write when listener cleanup throws', async () => {
    class BackpressuredSocket extends PassThrough {
      needsDrain = true

      override write(
        chunk: any,
        encodingOrCallback?: any,
        callback?: any
      ): boolean {
        super.write(chunk, encodingOrCallback, callback)
        return false
      }
    }

    const failure = new Error('drain listener cleanup failed')
    const socket = new BackpressuredSocket()
    Object.defineProperty(socket, 'writableNeedDrain', {
      configurable: true,
      get: () => socket.needsDrain,
    })
    socket.resume()
    failNextListenerRemoval(socket, 'drain', failure)

    const response = writeRawHttpResponse(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      new Response(null, { status: 204 })
    )
    socket.needsDrain = false

    expect(() => socket.emit('drain')).not.toThrow()
    await expect(response).rejects.toBe(failure)
    expect(socket.listenerCount('drain')).toBe(0)
    expect(socket.listenerCount('close')).toBe(0)
    socket.destroy()
  })

  it('cleans up the socket error owner when close-listener removal throws', async () => {
    const request = new PassThrough() as unknown as IncomingMessage
    const socket = new PassThrough()
    const failure = new Error('owned close listener cleanup failed')
    const consoleError = jest.spyOn(console, 'error').mockImplementation()

    ownWebSocketUpgradeSocketErrors(request, socket)
    failNextListenerRemoval(socket, 'close', failure)
    socket.destroy()

    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(request.listenerCount('error')).toBe(0)
    expect(socket.listenerCount('error')).toBe(0)
    expect(socket.listenerCount('close')).toBe(0)
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to remove a WebSocket upgrade socket error owner',
      failure
    )
  })

  it('releases only Next.js error listeners before coordinated delegation', () => {
    const request = new PassThrough() as unknown as IncomingMessage
    const socket = new PassThrough()
    const requestOwner = jest.fn()
    const socketOwner = jest.fn()
    request.on('error', requestOwner)
    socket.on('error', socketOwner)
    const requestBaseline = request.listenerCount('error')
    const socketErrorBaseline = socket.listenerCount('error')
    const socketCloseBaseline = socket.listenerCount('close')

    const release = ownWebSocketUpgradeSocketErrors(request, socket)
    expect(ownWebSocketUpgradeSocketErrors(request, socket)).toBe(release)
    expect(release()).toEqual([])

    expect(request.listenerCount('error')).toBe(requestBaseline)
    expect(socket.listenerCount('error')).toBe(socketErrorBaseline)
    expect(socket.listenerCount('close')).toBe(socketCloseBaseline)
    expect(request.listeners('error')).toContain(requestOwner)
    expect(socket.listeners('error')).toContain(socketOwner)
    expect(socket.destroyed).toBe(false)
    socket.destroy()
  })

  it('settles final socket teardown when close-listener removal throws', async () => {
    const socket = new PassThrough()
    const failure = new Error('final close listener cleanup failed')
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
    failNextListenerRemoval(socket, 'close', failure)

    await expect(
      writeRawHttpResponse(
        { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
        socket,
        new Response(null, { status: 204 })
      )
    ).resolves.toBeUndefined()

    expect(socket.destroyed).toBe(true)
    expect(socket.listenerCount('close')).toBe(0)
    expect(socket.listenerCount('error')).toBe(0)
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to finish closing a raw WebSocket response socket',
      failure
    )
  })

  it('cancels a pending response body when close-listener removal throws', async () => {
    const cancel = jest.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const socket = new PassThrough()
    socket.resume()
    const failure = new Error('body close listener cleanup failed')
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
    failNextListenerRemoval(socket, 'close', failure)

    const response = writeRawHttpResponse(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      new Response(body)
    )
    socket.destroy()

    await expect(response).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(socket.listenerCount('close')).toBe(0)
    expect(socket.listenerCount('error')).toBe(0)
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to remove raw WebSocket response body listeners',
      failure
    )
  })

  it('brands real raw-socket failures without trusting mutable error fields', async () => {
    expect(
      isWebSocketClientDisconnectError(
        Object.assign(new Error('application failure'), { code: 'EPIPE' })
      )
    ).toBe(false)
    expect(
      isWebSocketClientDisconnectError(
        Object.assign(new Error('application failure'), {
          name: 'ResponseAborted',
        })
      )
    ).toBe(false)
    expect(
      isWebSocketClientDisconnectError(
        new Error('WebSocket upgrade client disconnected.')
      )
    ).toBe(false)

    const socket = new PassThrough({ allowHalfOpen: true })
    socket.resume()
    const ended = once(socket, 'end')
    socket.push(null)
    await ended
    let disconnectError: unknown
    try {
      await writeRawHttpError(
        { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
        socket,
        500,
        'Internal Server Error'
      )
    } catch (error) {
      disconnectError = error
    }

    expect(isWebSocketClientDisconnectError(disconnectError)).toBe(true)
    socket.destroy()
  })

  it('uses fixed framing for framework-owned raw HTTP errors', async () => {
    const socket = new PassThrough()
    const output: Buffer[] = []
    socket.on('data', (chunk) => output.push(Buffer.from(chunk)))

    await writeRawHttpError(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      403,
      'WebSocket origin is not allowed.'
    )

    const raw = Buffer.concat(output).toString('latin1')
    expect(raw).toContain(
      'cache-control: private, no-cache, no-store, max-age=0, must-revalidate\r\n'
    )
    expect(raw).toContain('Content-Length: 32\r\n')
    expect(raw).not.toContain('Transfer-Encoding:')
    expect(raw.endsWith('\r\n\r\nWebSocket origin is not allowed.')).toBe(true)
  })

  it('owns the representation metadata for framework plaintext errors', async () => {
    const socket = new PassThrough()
    const output: Buffer[] = []
    socket.on('data', (chunk) => output.push(Buffer.from(chunk)))

    await writeRawHttpError(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      404,
      'Not Found',
      {
        'content-encoding': 'gzip',
        'content-length': '999',
        'content-type': 'application/json',
        'x-routing-header': 'preserved',
      }
    )

    const raw = Buffer.concat(output).toString('latin1')
    expect(raw).toBe(
      [
        'HTTP/1.1 404 Not Found',
        'cache-control: private, no-cache, no-store, max-age=0, must-revalidate',
        'content-type: text/plain; charset=utf-8',
        'x-routing-header: preserved',
        'Connection: close',
        'Content-Length: 9',
        '',
        'Not Found',
      ].join('\r\n')
    )
    expect(raw.toLowerCase()).not.toContain('content-encoding:')
  })

  it('replaces inherited cache metadata on framework errors', async () => {
    const socket = new PassThrough()
    const output: Buffer[] = []
    socket.on('data', (chunk) => output.push(Buffer.from(chunk)))

    await writeRawHttpError(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      404,
      'Not Found',
      {
        age: '60',
        'cache-control': 'public, s-maxage=86400',
        'cloudflare-cdn-cache-control': 'public, max-age=86400',
        'cdn-cache-control': 'public, max-age=86400',
        connection: 'content-type, x-nominated, not valid',
        'proxy-connection': 'cache-control, x-proxy-nominated, "quoted"',
        'edge-control': 'cache-maxage=1d',
        etag: '"poisoned"',
        expires: 'Wed, 21 Oct 2099 07:28:00 GMT',
        'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
        'netlify-cdn-cache-control': 'public, max-age=86400',
        'set-cookie': 'error-cookie=preserved; Path=/',
        'surrogate-control': 'max-age=86400',
        'vercel-cdn-cache-control': 'public, max-age=86400',
        vary: 'origin',
        'x-accel-buffering': 'yes',
        'x-accel-redirect': '/private/internal',
        'x-benign': 'preserved',
        'x-lighttpd-send-file': '/private/lighttpd',
        'x-nominated': 'hop secret',
        'x-proxy-nominated': 'proxy hop secret',
        'x-sendfile': '/private/sendfile',
      }
    )

    const raw = Buffer.concat(output).toString('latin1').toLowerCase()
    expect(
      raw.match(
        /cache-control: private, no-cache, no-store, max-age=0, must-revalidate\r\n/g
      )
    ).toHaveLength(1)
    for (const name of [
      'age',
      'cloudflare-cdn-cache-control',
      'cdn-cache-control',
      'edge-control',
      'etag',
      'expires',
      'last-modified',
      'netlify-cdn-cache-control',
      'surrogate-control',
      'vercel-cdn-cache-control',
      'x-accel-buffering',
      'x-accel-redirect',
      'x-lighttpd-send-file',
      'x-nominated',
      'x-proxy-nominated',
      'x-sendfile',
    ]) {
      expect(raw).not.toContain(`${name}:`)
    }
    expect(
      raw.match(/content-type: text\/plain; charset=utf-8\r\n/g)
    ).toHaveLength(1)
    expect(raw).toContain('set-cookie: error-cookie=preserved; path=/\r\n')
    expect(raw).toContain('vary: origin\r\n')
    expect(raw).toContain('x-benign: preserved\r\n')
  })

  it('removes otherwise benign fields explicitly nominated as hop-by-hop', async () => {
    const socket = new PassThrough()
    const output: Buffer[] = []
    socket.on('data', (chunk) => output.push(Buffer.from(chunk)))

    await writeRawHttpError(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      401,
      'Unauthorized',
      {
        allow: 'GET',
        connection: 'set-cookie, www-authenticate',
        'proxy-connection': 'retry-after',
        'retry-after': '60',
        'set-cookie': 'nominated=removed; Path=/',
        'www-authenticate': 'Bearer realm="private"',
        'x-benign': 'preserved',
      }
    )

    const raw = Buffer.concat(output).toString('latin1').toLowerCase()
    expect(raw).toContain('allow: get\r\n')
    expect(raw).toContain('x-benign: preserved\r\n')
    expect(raw).not.toContain('retry-after:')
    expect(raw).not.toContain('set-cookie:')
    expect(raw).not.toContain('www-authenticate:')
  })

  it('uses connection-close framing for an ordinary streaming response', async () => {
    const socket = new PassThrough()
    const output: Buffer[] = []
    socket.on('data', (chunk) => output.push(Buffer.from(chunk)))

    await writeRawHttpResponse(
      { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
      socket,
      new Response('declined by handler', {
        status: 401,
        headers: { 'cache-control': 'public, max-age=60' },
      })
    )

    const raw = Buffer.concat(output).toString('latin1')
    expect(raw).toContain('cache-control: public, max-age=60\r\n')
    expect(raw).toContain('Connection: close\r\n')
    expect(raw).not.toContain('Content-Length:')
    expect(raw).not.toContain('Transfer-Encoding:')
    expect(raw.endsWith('\r\n\r\ndeclined by handler')).toBe(true)
  })

  it('finishes a committed response after the peer half-closes', async () => {
    let finishBody!: () => void
    const bodyMayFinish = new Promise<void>((resolve) => {
      finishBody = resolve
    })
    let acceptedSocket: Socket | undefined
    let responseWrite: Promise<void> | undefined
    let bodyCancelled = false
    let acceptConnection!: () => void
    const connectionAccepted = new Promise<void>((resolve) => {
      acceptConnection = resolve
    })
    const server = createServer({ allowHalfOpen: true }, (socket) => {
      acceptedSocket = socket
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.from('first-'))
          void bodyMayFinish.then(() => {
            try {
              controller.enqueue(Buffer.from('second'))
              controller.close()
            } catch {}
          })
        },
        cancel() {
          bodyCancelled = true
        },
      })
      responseWrite = writeRawHttpResponse(
        { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
        socket,
        new Response(body, { status: 429 })
      )
      // The original promise is awaited below. This attached handler prevents
      // an early transport failure from becoming an unhandled rejection first.
      void responseWrite.catch(() => {})
      acceptConnection()
    })
    let client: Socket | undefined
    const output: Buffer[] = []

    try {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address')
      }

      let receiveFirstChunk!: () => void
      const firstChunkReceived = new Promise<void>((resolve) => {
        receiveFirstChunk = resolve
      })
      client = connectTcp(address.port, '127.0.0.1')
      client.on('data', (chunk) => {
        output.push(Buffer.from(chunk))
        if (Buffer.concat(output).includes(Buffer.from('first-'))) {
          receiveFirstChunk()
        }
      })
      await once(client, 'connect')
      await connectionAccepted
      await firstChunkReceived

      const serverReadEnded = once(acceptedSocket!, 'end')
      client.end()
      await serverReadEnded
      expect(acceptedSocket!.readableEnded).toBe(true)
      expect(acceptedSocket!.writableEnded).toBe(false)
      expect(bodyCancelled).toBe(false)

      const clientReadEnded = once(client, 'end')
      finishBody()
      await responseWrite
      await clientReadEnded

      const raw = Buffer.concat(output).toString('latin1')
      expect(raw).toContain('HTTP/1.1 429 Too Many Requests\r\n')
      expect(raw).toContain('Connection: close\r\n')
      expect(raw.endsWith('\r\n\r\nfirst-second')).toBe(true)
      expect(bodyCancelled).toBe(false)
      expect(acceptedSocket!.destroyed).toBe(true)
    } finally {
      finishBody()
      acceptedSocket?.destroy()
      client?.destroy()
      await responseWrite?.catch(() => {})
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    }
  })

  it('rejects a malformed response body chunk after committing exactly once', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue('not-bytes')
        controller.close()
      },
    }) as unknown as ReadableStream<Uint8Array>
    const socket = new PassThrough()
    const output: Buffer[] = []
    socket.on('data', (chunk) => output.push(Buffer.from(chunk)))

    await expect(
      writeRawHttpResponse(
        { method: 'GET', httpVersion: '1.1' } as IncomingMessage,
        socket,
        new Response(body)
      )
    ).rejects.toThrow(
      'WebSocket upgrade response bodies must emit Uint8Array chunks.'
    )

    const raw = Buffer.concat(output).toString('latin1')
    expect(getRawHttpResponseStatus(socket)).toBe(200)
    expect(raw.match(/HTTP\/1\.1/g)).toHaveLength(1)
    expect(raw).not.toContain('0\r\n\r\n')
    expect(socket.destroyed).toBe(true)
  })

  it('shares the committed marker across isolated module instances', () => {
    let isolatedHelpers!: typeof import('./websocket-http')
    jest.isolateModules(() => {
      isolatedHelpers =
        require('./websocket-http') as typeof import('./websocket-http')
    })

    const markedByPrimary = new PassThrough()
    markRawHttpResponseCommitted(markedByPrimary, 101)
    expect(isolatedHelpers.getRawHttpResponseStatus(markedByPrimary)).toBe(101)

    const markedByIsolated = new PassThrough()
    isolatedHelpers.markRawHttpResponseCommitted(markedByIsolated, 403)
    expect(getRawHttpResponseStatus(markedByIsolated)).toBe(403)

    expect(() =>
      isolatedHelpers.markRawHttpResponseCommitted(markedByPrimary, 500)
    ).toThrow('already committed with status 101')

    markedByPrimary.destroy()
    markedByIsolated.destroy()
  })
})

describe('WebSocket request policy primitives', () => {
  const createHandshake = (
    host: string,
    origin?: string,
    extensions?: string
  ) => {
    const headers: IncomingMessage['headers'] = {
      host,
      connection: 'Upgrade',
      upgrade: 'websocket',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13',
      ...(origin ? { origin } : {}),
      ...(extensions ? { 'sec-websocket-extensions': extensions } : {}),
    }
    const rawHeaders = Object.entries(headers).flatMap(([name, value]) => [
      name,
      String(value),
    ])
    return {
      method: 'GET',
      httpVersion: '1.1',
      headers,
      rawHeaders,
      socket: {},
    } as unknown as IncomingMessage
  }

  it('rejects wildcard request authorities and origins', () => {
    expect(validateWebSocketHandshake(createHandshake('*'))).toMatchObject({
      status: 400,
    })
    expect(
      validateWebSocketOrigin(
        createHandshake('*.example.com', 'http://*.example.com')
      )
    ).toMatchObject({ status: 403 })
  })

  it('rejects incomplete normalized headers even when raw fields remain', () => {
    const request = createHandshake('example.com')
    delete request.headers.connection
    delete request.headers.upgrade
    delete request.headers['sec-websocket-key']
    delete request.headers['sec-websocket-version']

    expect(request.rawHeaders).toContain('Upgrade')
    expect(validateWebSocketHandshake(request)).toEqual({
      status: 400,
      message: 'Invalid WebSocket Upgrade header.',
    })
  })

  it('distinguishes a missing vendored extension parser from client syntax', () => {
    expect(
      validateWebSocketHandshake(
        createHandshake('example.com', undefined, 'permessage-deflate; =')
      )
    ).toMatchObject({ status: 400 })

    try {
      expect(() =>
        jest.isolateModules(() => {
          jest.doMock('next/dist/compiled/ws', () => ({ extension: undefined }))
          const isolatedHelpers =
            require('./websocket-http') as typeof import('./websocket-http')
          isolatedHelpers.validateWebSocketHandshake(
            createHandshake('example.com', undefined, 'permessage-deflate')
          )
        })
      ).toThrow('The vendored WebSocket extension parser is unavailable.')
    } finally {
      jest.dontMock('next/dist/compiled/ws')
    }
  })
})
