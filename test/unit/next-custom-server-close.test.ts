import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { PendingWebSocketUpgradeTracker } from 'next/dist/server/websocket-lifecycle'

const { getRequestMeta } = jest.requireActual(
  'next/dist/server/request-meta'
) as {
  getRequestMeta(
    request: object,
    key: 'webSocketUpgradeOwnership'
  ): 'exclusive' | 'coordinated' | 'shared' | undefined
}

const mockFlushAllTraces = jest.fn<Promise<void>, []>()
const mockGetRequestHandlers = jest.fn()

jest.mock('next/dist/trace', () => ({
  flushAllTraces: () => mockFlushAllTraces(),
}))
jest.mock('next/dist/server/lib/start-server', () => ({
  getRequestHandlers: (...args: unknown[]) => mockGetRequestHandlers(...args),
}))

const next = jest.requireActual('next/dist/server/next') as (options: {
  customServer: boolean
  dev: boolean
  dir: string
  httpServer?: EventEmitter
}) => {
  close(): Promise<void>
  prepare(): Promise<void>
}

type Stage = () => void | Promise<void>

function createCustomServer({
  enabled,
  closeUpgraded = () => {},
  closePending = () => {},
  closeServer = () => {},
  cleanup = () => {},
}: {
  enabled: boolean
  closeUpgraded?: Stage
  closePending?: Stage
  closeServer?: Stage
  cleanup?: Stage
}) {
  const app = next({
    customServer: true,
    dev: false,
    dir: process.cwd(),
  }) as any

  app.init = {
    closeUpgraded,
    server: { close: closeServer },
    webSocketRouteHandlersEnabled: enabled,
  }
  app.pendingUpgrades = {
    closePending() {
      try {
        return Promise.resolve(closePending())
      } catch (error) {
        return Promise.reject(error)
      }
    },
  }
  app.cleanupListeners = { runAll: cleanup }
  app.prepareGeneration = {
    promise: Promise.resolve(),
    init: app.init,
    pendingUpgrades: app.pendingUpgrades,
    cleanupListeners: app.cleanupListeners,
  }
  return app as { close(): Promise<void> }
}

describe('NextCustomServer WebSocket shutdown evidence', () => {
  beforeEach(() => {
    mockFlushAllTraces.mockReset().mockResolvedValue()
    mockGetRequestHandlers.mockReset()
  })

  it('attempts every stage and preserves one failure identity', async () => {
    const failure = new Error('pending upgrade close failed')
    const calls: string[] = []
    const app = createCustomServer({
      enabled: true,
      closeUpgraded() {
        calls.push('close-upgraded')
      },
      closePending() {
        calls.push('close-pending')
        throw failure
      },
      closeServer() {
        calls.push('close-server')
      },
      cleanup() {
        calls.push('cleanup')
      },
    })

    await expect(app.close()).rejects.toBe(failure)
    expect(calls).toEqual([
      'close-pending',
      'close-upgraded',
      'close-server',
      'cleanup',
    ])
  })

  it('flattens, deduplicates, and orders failures across shutdown', async () => {
    const first = new Error('first close failed')
    const second = new Error('pending close failed')
    const third = new Error('server close failed')
    const fourth = new Error('cleanup failed')
    const app = createCustomServer({
      enabled: true,
      closeUpgraded() {
        throw new AggregateError([first, second, first], 'upgraded close')
      },
      closePending() {
        throw second
      },
      closeServer() {
        throw third
      },
      cleanup() {
        throw fourth
      },
    })

    await expect(app.close()).rejects.toEqual(
      expect.objectContaining({
        message: 'Failed to close the Next.js custom server',
        errors: [second, first, third, fourth],
        cause: second,
      })
    )
  })

  it('preserves a cyclic AggregateError from the one upgraded drain', async () => {
    const failure = new AggregateError([], 'cyclic close failure')
    failure.errors.push(failure)
    let closeUpgradedCalls = 0
    const app = createCustomServer({
      enabled: true,
      closeUpgraded() {
        closeUpgradedCalls++
        if (closeUpgradedCalls === 1) throw failure
      },
    })

    await expect(app.close()).rejects.toBe(failure)
    expect(closeUpgradedCalls).toBe(1)
  })

  it('shares the memoized rejection across concurrent close callers', async () => {
    const failure = new Error('upgraded close failed')
    let finishClose!: () => void
    const app = createCustomServer({
      enabled: true,
      closeUpgraded() {
        return new Promise<void>((_resolve, reject) => {
          finishClose = () => {
            reject(failure)
          }
        })
      },
    })

    const firstClose = app.close()
    const secondClose = app.close()
    expect(secondClose).toBe(firstClose)
    await new Promise<void>((resolve) => setImmediate(resolve))
    finishClose()

    await expect(firstClose).rejects.toBe(failure)
    await expect(secondClose).rejects.toBe(failure)
  })

  it('publishes the close promise before removeListener can re-enter close', async () => {
    const calls: string[] = []
    const app = createCustomServer({
      enabled: true,
      closeUpgraded() {
        calls.push('close-upgraded')
      },
      closePending() {
        calls.push('close-pending')
      },
      closeServer() {
        calls.push('close-server')
      },
      cleanup() {
        calls.push('cleanup')
      },
    }) as any
    const server = new EventEmitter()
    const upgradeListener = jest.fn()
    server.on('upgrade', upgradeListener)
    app.webSocketServer = server
    app.webSocketUpgradeListener = upgradeListener

    let reentrantClose: Promise<void> | undefined
    server.on('removeListener', (event, listener) => {
      if (event === 'upgrade' && listener === upgradeListener) {
        reentrantClose = app.close()
      }
    })

    const close = app.close()
    await Promise.resolve()
    expect(reentrantClose).toBe(close)
    await close
    expect(calls).toEqual([
      'close-pending',
      'close-upgraded',
      'close-server',
      'cleanup',
    ])
  })

  it('continues teardown when a removeListener observer throws', async () => {
    const failure = new Error('removeListener failed')
    const calls: string[] = []
    const app = createCustomServer({
      enabled: true,
      closeUpgraded() {
        calls.push('close-upgraded')
      },
      closePending() {
        calls.push('close-pending')
      },
      closeServer() {
        calls.push('close-server')
      },
      cleanup() {
        calls.push('cleanup')
      },
    }) as any
    const server = new EventEmitter()
    const upgradeListener = jest.fn()
    server.on('upgrade', upgradeListener)
    app.webSocketServer = server
    app.webSocketUpgradeListener = upgradeListener
    server.on('removeListener', (event, listener) => {
      if (event === 'upgrade' && listener === upgradeListener) throw failure
    })

    let close!: Promise<void>
    expect(() => {
      close = app.close()
    }).not.toThrow()
    expect(app.close()).toBe(close)
    await expect(close).rejects.toBe(failure)
    expect(calls).toEqual([
      'close-pending',
      'close-upgraded',
      'close-server',
      'cleanup',
    ])
  })

  it('waits for an in-flight listener registration before closing', async () => {
    const app = createCustomServer({ enabled: true }) as any
    const server = new EventEmitter()
    let close: Promise<void> | undefined
    server.on('newListener', (event) => {
      if (event === 'upgrade') close = app.close()
    })

    app.setupWebSocketHandler(server)
    expect(close).toBeDefined()
    await close

    expect(server.listeners('upgrade')).toEqual([])
  })

  it('does not detach an auto listener when its public getter is re-entered', () => {
    const app = createCustomServer({ enabled: true }) as any
    const server = new EventEmitter()
    let explicitUpgrade: unknown
    server.on('newListener', (event) => {
      if (event === 'upgrade') explicitUpgrade = app.getUpgradeHandler()
    })

    app.setupWebSocketHandler(server)

    expect(explicitUpgrade).toBeDefined()
    expect(app.getUpgradeHandler()).toBe(explicitUpgrade)
    expect(server.listeners('upgrade')).toEqual([
      app.webSocketAutomaticUpgradeListener,
    ])
    expect(app.webSocketAutomaticUpgradeListener).not.toBe(explicitUpgrade)
    expect(app.webSocketServer).toBe(server)
    expect(app.webSocketRegistration).toBeDefined()
    expect(app.didWebSocketSetup).toBe(true)
  })

  it('keeps the getter non-destructive and reports removal failures on close', async () => {
    const failure = new Error('removeListener failed')
    const app = createCustomServer({ enabled: true }) as any
    const server = new EventEmitter()
    app.setupWebSocketHandler(server)
    const upgradeListener = app.webSocketAutomaticUpgradeListener
    server.on('removeListener', (event, listener) => {
      if (event === 'upgrade' && listener === upgradeListener) throw failure
    })

    expect(app.getUpgradeHandler()).not.toBe(upgradeListener)
    expect(server.listeners('upgrade')).toEqual([upgradeListener])

    await expect(app.close()).rejects.toBe(failure)
    expect(server.listeners('upgrade')).toEqual([])
    expect(app.webSocketServer).toBeUndefined()
    expect(app.webSocketRegistration).toBeUndefined()
  })

  it('removes every Next-owned upgrade registration on close', async () => {
    const app = createCustomServer({ enabled: true }) as any
    const server = new EventEmitter()
    app.setupWebSocketHandler(server)
    const upgradeListener = app.getUpgradeHandler()
    server.on('upgrade', upgradeListener)

    expect(server.listeners('upgrade')).toEqual([
      app.webSocketAutomaticUpgradeListener,
      upgradeListener,
    ])
    await expect(app.close()).resolves.toBeUndefined()
    expect(server.listeners('upgrade')).toEqual([])
  })

  it('does not retain setup state when a newListener observer throws', () => {
    const failure = new Error('newListener failed')
    const app = createCustomServer({ enabled: true }) as any
    const server = new EventEmitter()
    server.on('newListener', (event) => {
      if (event === 'upgrade') throw failure
    })

    expect(() => app.setupWebSocketHandler(server)).toThrow(failure)
    expect(app.didWebSocketSetup).toBe(false)
    expect(app.webSocketServer).toBeUndefined()
    expect(app.webSocketRegistration).toBeUndefined()
    expect(server.listeners('upgrade')).toEqual([])
  })

  it('rolls back an upgrade listener when server.on inserts then throws', () => {
    const failure = new Error('upgrade listener registration failed')
    const app = createCustomServer({ enabled: true }) as any
    class InsertThenThrowServer extends EventEmitter {
      override on(event: string | symbol, listener: (...args: any[]) => void) {
        super.on(event, listener)
        if (event === 'upgrade') throw failure
        return this
      }
    }
    const server = new InsertThenThrowServer()

    expect(() => app.setupWebSocketHandler(server)).toThrow(failure)
    expect(server.listeners('upgrade')).toEqual([])
    expect(app.didWebSocketSetup).toBe(false)
    expect(app.webSocketServer).toBeUndefined()
    expect(app.webSocketRegistration).toBeUndefined()
  })

  it('rolls back a live initialization when prepare-time attachment fails', async () => {
    const setupFailure = new Error('upgrade listener registration failed')
    const upgradedFailure = new Error('upgraded cleanup failed')
    const serverFailure = new Error('server cleanup failed')
    class InsertThenThrowServer extends EventEmitter {
      override on(event: string | symbol, listener: (...args: any[]) => void) {
        super.on(event, listener)
        if (event === 'upgrade') throw setupFailure
        return this
      }
    }
    const httpServer = new InsertThenThrowServer()
    const closeUpgraded = jest.fn(() => {
      throw upgradedFailure
    })
    const closeServer = jest.fn(() => {
      throw serverFailure
    })
    mockGetRequestHandlers.mockResolvedValueOnce({
      closeUpgraded,
      server: { close: closeServer },
      webSocketRouteHandlersEnabled: true,
    })
    const app = next({
      customServer: true,
      dev: false,
      dir: process.cwd(),
      httpServer,
    }) as any

    await expect(app.prepare()).rejects.toEqual(
      expect.objectContaining({
        message: 'Failed to prepare the Next.js custom server',
        cause: setupFailure,
        errors: [setupFailure, upgradedFailure, serverFailure],
      })
    )
    expect(closeUpgraded).toHaveBeenCalledTimes(1)
    expect(closeServer).toHaveBeenCalledTimes(1)
    expect(httpServer.listeners('upgrade')).toEqual([])

    const retryCloseUpgraded = jest.fn()
    const retryCloseServer = jest.fn()
    mockGetRequestHandlers.mockResolvedValueOnce({
      closeUpgraded: retryCloseUpgraded,
      server: { close: retryCloseServer },
      webSocketRouteHandlersEnabled: true,
    })
    app.options.httpServer = new EventEmitter()
    await expect(app.prepare()).resolves.toBeUndefined()
    await expect(app.close()).resolves.toBeUndefined()
    expect(retryCloseUpgraded).toHaveBeenCalledTimes(1)
    expect(retryCloseServer).toHaveBeenCalledTimes(1)
  })

  it('handles one request once when its stable listener is registered twice', async () => {
    const app = createCustomServer({ enabled: true }) as any
    const pendingUpgrades = new PendingWebSocketUpgradeTracker()
    app.pendingUpgrades = pendingUpgrades
    app.prepareGeneration.pendingUpgrades = pendingUpgrades
    app.init.upgradeHandler = jest.fn()
    const server = new EventEmitter()
    app.setupWebSocketHandler(server)
    const upgradeListener = app.getUpgradeHandler()
    server.on('upgrade', upgradeListener)
    const socket = new PassThrough() as PassThrough & {
      server?: EventEmitter
    }
    socket.server = server
    const request = { headers: {}, method: 'GET', socket }

    server.emit('upgrade', request, socket, Buffer.alloc(0))
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(app.init.upgradeHandler).toHaveBeenCalledTimes(1)
    expect(getRequestMeta(request, 'webSocketUpgradeOwnership')).toBe(
      'exclusive'
    )
    socket.destroy()
  })

  it('dispatches sibling Next.js listeners on one custom server', async () => {
    const firstApp = createCustomServer({ enabled: true }) as any
    const secondApp = createCustomServer({ enabled: true }) as any
    for (const app of [firstApp, secondApp]) {
      const pendingUpgrades = new PendingWebSocketUpgradeTracker()
      app.pendingUpgrades = pendingUpgrades
      app.prepareGeneration.pendingUpgrades = pendingUpgrades
      app.init.upgradeHandler = jest.fn()
    }
    const server = new EventEmitter()
    firstApp.setupWebSocketHandler(server)
    secondApp.setupWebSocketHandler(server)
    const socket = new PassThrough() as PassThrough & {
      server?: EventEmitter
    }
    socket.server = server
    const request = { headers: {}, method: 'GET', socket }

    server.emit('upgrade', request, socket, Buffer.alloc(0))
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(firstApp.init.upgradeHandler).toHaveBeenCalledTimes(1)
    expect(secondApp.init.upgradeHandler).toHaveBeenCalledTimes(1)
    expect(getRequestMeta(request, 'webSocketUpgradeOwnership')).toBe(
      'coordinated'
    )
    socket.destroy()
    await Promise.all([firstApp.close(), secondApp.close()])
  })

  it('coordinates through one outer dispatcher after automatic setup', async () => {
    const app = createCustomServer({ enabled: true }) as any
    const pendingUpgrades = new PendingWebSocketUpgradeTracker()
    app.pendingUpgrades = pendingUpgrades
    app.prepareGeneration.pendingUpgrades = pendingUpgrades
    app.init.upgradeHandler = jest.fn()
    const server = new EventEmitter()
    app.setupWebSocketHandler(server)
    const nextUpgrade = app.getUpgradeHandler()
    const outerDispatcher = jest.fn((request: any, socket: any, head: Buffer) =>
      nextUpgrade(request, socket, head)
    )
    server.on('upgrade', outerDispatcher)
    const socket = new PassThrough() as PassThrough & {
      server?: EventEmitter
    }
    socket.server = server
    const request = { headers: {}, method: 'GET', socket }

    server.emit('upgrade', request, socket, Buffer.alloc(0))
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(outerDispatcher).toHaveBeenCalledTimes(1)
    expect(app.init.upgradeHandler).toHaveBeenCalledTimes(1)
    expect(getRequestMeta(request, 'webSocketUpgradeOwnership')).toBe(
      'coordinated'
    )
    socket.destroy()
  })

  it('fails closed when a one-shot listener disappears before dispatch', async () => {
    const app = createCustomServer({ enabled: true }) as any
    app.pendingUpgrades = new PendingWebSocketUpgradeTracker()
    app.prepareGeneration.pendingUpgrades = app.pendingUpgrades
    const server = new EventEmitter()
    const socket = new PassThrough() as PassThrough & {
      server?: EventEmitter
    }
    socket.server = server
    const request = {
      headers: {},
      method: 'GET',
      socket,
    }
    let ownership: 'exclusive' | 'coordinated' | 'shared' | undefined
    app.init.upgradeHandler = jest.fn(async () => {
      ownership = getRequestMeta(request as any, 'webSocketUpgradeOwnership')
    })

    server.once('upgrade', app.getUpgradeHandler())
    server.emit('upgrade', request, socket, Buffer.alloc(0))
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(app.init.upgradeHandler).not.toHaveBeenCalled()
    expect(ownership).toBeUndefined()
    socket.destroy()
  })

  it('does not reclaim an upgrade from an external listener emit snapshot', async () => {
    const app = createCustomServer({ enabled: true }) as any
    app.pendingUpgrades = new PendingWebSocketUpgradeTracker()
    app.prepareGeneration.pendingUpgrades = app.pendingUpgrades
    app.init.upgradeHandler = jest.fn()
    const server = new EventEmitter()
    const externalListener = jest.fn(() => {
      server.off('upgrade', externalListener)
    })
    server.on('upgrade', externalListener)
    app.setupWebSocketHandler(server)
    const socket = new PassThrough() as PassThrough & {
      server?: EventEmitter
    }
    socket.server = server

    server.emit(
      'upgrade',
      { headers: {}, method: 'GET', socket },
      socket,
      Buffer.alloc(0)
    )
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(externalListener).toHaveBeenCalledTimes(1)
    expect(app.init.upgradeHandler).not.toHaveBeenCalled()
    expect(socket.destroyed).toBe(false)
    socket.destroy()
  })

  it('does not invoke the route after upgrade tracking re-enters close', async () => {
    const app = createCustomServer({ enabled: true }) as any
    const pendingUpgrades = new PendingWebSocketUpgradeTracker()
    app.pendingUpgrades = pendingUpgrades
    app.prepareGeneration.pendingUpgrades = pendingUpgrades
    app.init.upgradeHandler = jest.fn()
    const socket = new EventEmitter() as any
    socket.destroyed = false
    socket.readableEnded = false
    socket.writableEnded = false
    socket.destroy = jest.fn(() => {
      if (socket.destroyed) return
      socket.destroyed = true
      socket.emit('close')
    })
    let close: Promise<void> | undefined
    socket.on('newListener', (event) => {
      if (event === 'end' && !close) close = app.close()
    })
    const listener = app.getOrCreateWebSocketUpgradeListener()
    const server = new EventEmitter()
    server.on('upgrade', listener)

    await listener(
      { headers: {}, socket: { server }, method: 'GET' },
      socket,
      Buffer.alloc(0)
    )
    await close

    expect(app.init.upgradeHandler).not.toHaveBeenCalled()
    expect(socket.destroy).toHaveBeenCalled()
  })

  it('contains a pending-upgrade listener installation failure', async () => {
    const failure = new Error('pending listener installation failed')
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
    const app = createCustomServer({ enabled: true }) as any
    const pendingUpgrades = new PendingWebSocketUpgradeTracker()
    app.pendingUpgrades = pendingUpgrades
    app.prepareGeneration.pendingUpgrades = pendingUpgrades
    app.init.upgradeHandler = jest.fn()
    const socket = new EventEmitter() as any
    socket.destroyed = false
    socket.readableEnded = false
    socket.writableEnded = false
    socket.destroy = jest.fn(() => {
      socket.destroyed = true
      socket.emit('close')
    })
    socket.on('newListener', (event) => {
      if (event === 'end') throw failure
    })
    const listener = app.getOrCreateWebSocketUpgradeListener()
    const server = new EventEmitter()
    server.on('upgrade', listener)

    await expect(
      listener(
        { headers: {}, socket: { server }, method: 'GET' },
        socket,
        Buffer.alloc(0)
      )
    ).resolves.toBeUndefined()

    expect(app.init.upgradeHandler).not.toHaveBeenCalled()
    expect(socket.destroy).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      'Error handling upgrade request',
      failure
    )
  })

  it('waits for an active prepare generation and closes it exactly once', async () => {
    let finishPrepare!: (value: any) => void
    const closeUpgraded = jest.fn()
    const closeServer = jest.fn()
    mockGetRequestHandlers.mockReturnValue(
      new Promise((resolve) => {
        finishPrepare = resolve
      })
    )
    const app = next({
      customServer: true,
      dev: false,
      dir: process.cwd(),
    })

    const firstPrepare = app.prepare()
    const secondPrepare = app.prepare()
    expect(secondPrepare).toBe(firstPrepare)

    const firstClose = app.close()
    const secondClose = app.close()
    expect(secondClose).toBe(firstClose)
    let closeSettled = false
    void firstClose.finally(() => {
      closeSettled = true
    })
    await Promise.resolve()
    expect(closeSettled).toBe(false)

    finishPrepare({
      closeUpgraded,
      server: { close: closeServer },
      webSocketRouteHandlersEnabled: true,
    })
    await firstPrepare
    await firstClose

    expect(closeUpgraded).toHaveBeenCalledTimes(1)
    expect(closeServer).toHaveBeenCalledTimes(1)
    expect(app.close()).toBe(firstClose)
  })

  it('does not let a pre-prepare close poison the prepared generation', async () => {
    const closeUpgraded = jest.fn()
    const closeServer = jest.fn()
    mockGetRequestHandlers.mockResolvedValue({
      closeUpgraded,
      server: { close: closeServer },
      webSocketRouteHandlersEnabled: true,
    })
    const app = next({
      customServer: true,
      dev: false,
      dir: process.cwd(),
    })

    await expect(app.close()).resolves.toBeUndefined()
    await app.prepare()
    await app.close()

    expect(closeUpgraded).toHaveBeenCalledTimes(1)
    expect(closeServer).toHaveBeenCalledTimes(1)
  })

  it('releases a failed prepare generation without poisoning a racing retry', async () => {
    const prepareFailure = new Error('prepare failed')
    let rejectPrepare!: (error: Error) => void
    let markCleanupStarted!: () => void
    let finishCleanup!: () => void
    const cleanupStarted = new Promise<void>((resolve) => {
      markCleanupStarted = resolve
    })
    const cleanupGate = new Promise<void>((resolve) => {
      finishCleanup = resolve
    })
    mockGetRequestHandlers.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectPrepare = reject
      })
    )
    const app = next({
      customServer: true,
      dev: false,
      dir: process.cwd(),
    })

    const firstPrepare = app.prepare()
    const firstClose = app.close()
    expect(app.close()).toBe(firstClose)
    ;(app as any).prepareGeneration.cleanupListeners = {
      runAll() {
        markCleanupStarted()
        return cleanupGate
      },
    }
    rejectPrepare(prepareFailure)

    await expect(firstPrepare).rejects.toBe(prepareFailure)
    await cleanupStarted
    const repeatedFailedGenerationClose = app.close()
    expect(repeatedFailedGenerationClose).toBe(firstClose)
    let failedGenerationCloseSettled = false
    void repeatedFailedGenerationClose.finally(() => {
      failedGenerationCloseSettled = true
    })
    await Promise.resolve()
    expect(failedGenerationCloseSettled).toBe(false)

    const closeUpgraded = jest.fn()
    const closeServer = jest.fn()
    mockGetRequestHandlers.mockResolvedValueOnce({
      closeUpgraded,
      server: { close: closeServer },
      webSocketRouteHandlersEnabled: true,
    })
    await app.prepare()
    const retryClose = app.close()
    await retryClose

    finishCleanup()
    await expect(firstClose).resolves.toBeUndefined()

    expect(mockGetRequestHandlers).toHaveBeenCalledTimes(2)
    expect(closeUpgraded).toHaveBeenCalledTimes(1)
    expect(closeServer).toHaveBeenCalledTimes(1)
    expect(app.close()).toBe(retryClose)
  })

  it('does not deadlock when initialization requests an early restart', async () => {
    const calls: string[] = []
    const closeServer = jest.fn(() => calls.push('close-server'))
    mockGetRequestHandlers.mockImplementationOnce(async (options) => {
      await options.restartServer()
      calls.push('finish-prepare')
      return {
        closeUpgraded: jest.fn(),
        server: { close: closeServer },
        webSocketRouteHandlersEnabled: true,
      }
    })
    mockFlushAllTraces.mockImplementation(async () => {
      calls.push('flush-traces')
    })
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      calls.push('exit')
    }) as never)

    try {
      const app = next({
        customServer: true,
        dev: false,
        dir: process.cwd(),
      })
      await app.prepare()
      await app.close()

      expect(calls).toEqual([
        'flush-traces',
        'exit',
        'finish-prepare',
        'close-server',
      ])
    } finally {
      exit.mockRestore()
    }
  })

  it('retains legacy silent close semantics when the flag is disabled', async () => {
    const calls: string[] = []
    const fail = (stage: string) => {
      calls.push(stage)
      throw new Error(`${stage} failed`)
    }
    const app = createCustomServer({
      enabled: false,
      closeUpgraded: () => fail('close-upgraded'),
      closePending: () => fail('close-pending'),
      closeServer: () => fail('close-server'),
      cleanup: () => fail('cleanup'),
    })

    await expect(app.close()).resolves.toBeUndefined()
    expect(calls).toEqual([
      'close-pending',
      'close-upgraded',
      'close-server',
      'cleanup',
    ])
  })

  it('flushes traces after a restart close failure before exiting', async () => {
    const failure = new Error('restart close failed')
    const calls: string[] = []
    let restartServer!: () => Promise<void>
    mockGetRequestHandlers.mockImplementation(async (options) => {
      restartServer = options.restartServer
      return {
        closeUpgraded() {
          calls.push('close-upgraded')
          throw failure
        },
        server: {
          close() {
            calls.push('close-server')
          },
        },
        webSocketRouteHandlersEnabled: true,
      }
    })
    mockFlushAllTraces.mockImplementation(async () => {
      calls.push('flush-traces')
    })
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      calls.push('exit')
    }) as never)
    const consoleError = jest.spyOn(console, 'error').mockImplementation()

    try {
      const app = next({
        customServer: true,
        dev: false,
        dir: process.cwd(),
      })
      await app.prepare()
      await restartServer()

      expect(consoleError).toHaveBeenCalledWith(
        'Failed to close the Next.js custom server during restart',
        failure
      )
      expect(calls).toEqual([
        'close-upgraded',
        'close-server',
        'flush-traces',
        'exit',
      ])
    } finally {
      consoleError.mockRestore()
      exit.mockRestore()
    }
  })
})
