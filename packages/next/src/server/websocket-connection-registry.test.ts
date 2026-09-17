import type { WebSocketRegistryConnection } from './websocket-connection-registry'
import {
  closeWebSocketScope,
  registerWebSocketPeer,
  settleWebSocketShutdownStages,
  trackWebSocketTask,
  tryAcquireWebSocketScopeLease,
  unregisterWebSocketPeer,
} from './websocket-connection-registry'

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

function createConnection(initialReadyState = 1) {
  let readyState = initialReadyState
  let closeListener: (() => void) | undefined
  const removeCloseListener = jest.fn(() => {
    closeListener = undefined
  })
  const connection: WebSocketRegistryConnection = {
    getReadyState: jest.fn(() => readyState),
    onClose: jest.fn((listener) => {
      closeListener = listener
      return removeCloseListener
    }),
    close: jest.fn(() => {
      readyState = 2
    }),
    terminate: jest.fn(() => {
      readyState = 3
      closeListener?.()
    }),
  }
  return {
    connection,
    emitClose() {
      readyState = 3
      closeListener?.()
    },
  }
}

describe('WebSocket connection registry', () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('registers once, unregisters, and isolates scopes', async () => {
    const scopeA = {}
    const scopeB = {}
    const first = createConnection()
    const second = createConnection()

    expect(registerWebSocketPeer(first.connection, scopeA)).toBe(true)
    expect(registerWebSocketPeer(first.connection, scopeA)).toBe(true)
    expect(registerWebSocketPeer(second.connection, scopeB)).toBe(true)
    unregisterWebSocketPeer(first.connection, scopeA)

    await closeWebSocketScope(scopeA)
    expect(first.connection.close).not.toHaveBeenCalled()
    expect(second.connection.close).not.toHaveBeenCalled()

    const closingB = closeWebSocketScope(scopeB)
    await Promise.resolve()
    expect(second.connection.close).toHaveBeenCalledTimes(1)
    second.emitClose()
    await closingB
  })

  it('closes gracefully with 1001 and waits for the close event', async () => {
    const scope = {}
    const peer = createConnection()
    registerWebSocketPeer(peer.connection, scope)

    let settled = false
    const closing = closeWebSocketScope(scope).then(() => {
      settled = true
    })
    await Promise.resolve()

    expect(peer.connection.close).toHaveBeenCalledWith(1001)
    expect(settled).toBe(false)
    peer.emitClose()
    await closing
    expect(peer.connection.terminate).not.toHaveBeenCalled()
    expect(peer.connection.onClose).toHaveBeenCalledTimes(1)
  })

  it('preserves a closing peer code and skips a closed peer', async () => {
    jest.useFakeTimers()
    const scope = {}
    const closingPeer = createConnection(2)
    const closedPeer = createConnection(3)
    registerWebSocketPeer(closingPeer.connection, scope)
    registerWebSocketPeer(closedPeer.connection, scope)

    const closing = closeWebSocketScope(scope, 1012)
    await Promise.resolve()
    expect(closingPeer.connection.close).not.toHaveBeenCalled()
    expect(closedPeer.connection.onClose).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(5_000)
    await closing
    expect(closingPeer.connection.terminate).toHaveBeenCalledTimes(1)
    expect(closedPeer.connection.terminate).not.toHaveBeenCalled()
  })

  it('terminates a peer that does not complete its graceful close', async () => {
    jest.useFakeTimers()
    const scope = {}
    const peer = createConnection()
    registerWebSocketPeer(peer.connection, scope)

    const closing = closeWebSocketScope(scope)
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(4_999)
    expect(peer.connection.terminate).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(1)
    await closing
    expect(peer.connection.terminate).toHaveBeenCalledTimes(1)
  })

  it('contains each capability until all peers have been attempted', async () => {
    const scope = {}
    const closeError = new Error('close failed')
    const first = createConnection()
    const second = createConnection()
    ;(first.connection.close as jest.Mock).mockImplementation(() => {
      throw closeError
    })
    ;(second.connection.close as jest.Mock).mockImplementation(() => {
      second.emitClose()
    })
    registerWebSocketPeer(first.connection, scope)
    registerWebSocketPeer(second.connection, scope)

    await expect(closeWebSocketScope(scope)).rejects.toBe(closeError)
    expect(first.connection.terminate).toHaveBeenCalledTimes(1)
    expect(second.connection.close).toHaveBeenCalledTimes(1)
  })

  it('aggregates independent lifecycle failures without hanging', async () => {
    const scope = {}
    const listenerError = new Error('listener failed')
    const terminateError = new Error('terminate failed')
    const peer = createConnection()
    ;(peer.connection.onClose as jest.Mock).mockImplementation(() => {
      throw listenerError
    })
    ;(peer.connection.terminate as jest.Mock).mockImplementation(() => {
      throw terminateError
    })
    registerWebSocketPeer(peer.connection, scope)

    const error = await closeWebSocketScope(scope).catch((caught) => caught)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toEqual([listenerError, terminateError])
  })

  it('publishes one drain before close reentrancy and latches its code', async () => {
    const scope = {}
    const peer = createConnection()
    let reentrantDrain: Promise<void> | undefined
    ;(peer.connection.close as jest.Mock).mockImplementation(() => {
      reentrantDrain = closeWebSocketScope(scope, 1012)
    })
    registerWebSocketPeer(peer.connection, scope)

    const drain = closeWebSocketScope(scope, 1001)
    await Promise.resolve()
    expect(reentrantDrain).toBe(drain)
    expect(peer.connection.close).toHaveBeenCalledWith(1001)
    peer.emitClose()
    await drain

    const late = createConnection()
    expect(registerWebSocketPeer(late.connection, scope)).toBe(false)
    await Promise.resolve()
    expect(late.connection.close).toHaveBeenCalledWith(1001)
    late.emitClose()
  })

  it('handles a synchronous close during listener installation', async () => {
    const scope = {}
    const peer = createConnection()
    ;(peer.connection.onClose as jest.Mock).mockImplementation((listener) => {
      listener()
      return jest.fn()
    })
    registerWebSocketPeer(peer.connection, scope)

    await expect(closeWebSocketScope(scope)).resolves.toBeUndefined()
    expect(peer.connection.close).not.toHaveBeenCalled()
  })

  it('closes peers before draining tasks registered by their close event', async () => {
    const scope = {}
    const peer = createConnection()
    const hookTask = deferred()
    const order: string[] = []
    ;(peer.connection.close as jest.Mock).mockImplementation(() => {
      order.push('peer-close')
      trackWebSocketTask(hookTask.promise, scope)
      peer.emitClose()
    })
    registerWebSocketPeer(peer.connection, scope)

    let settled = false
    const closing = closeWebSocketScope(scope).then(() => {
      settled = true
      order.push('scope-close')
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(order).toEqual(['peer-close'])
    expect(settled).toBe(false)
    hookTask.resolve()
    await closing
    expect(order).toEqual(['peer-close', 'scope-close'])
  })

  it('waits for an admitted upgrade and its rejected late peer', async () => {
    const scope = {}
    const lease = tryAcquireWebSocketScopeLease(scope)
    expect(lease).toBeDefined()

    let settled = false
    const closing = closeWebSocketScope(scope).then(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(settled).toBe(false)
    expect(tryAcquireWebSocketScopeLease(scope)).toBeUndefined()

    const latePeer = createConnection()
    expect(registerWebSocketPeer(latePeer.connection, scope)).toBe(false)
    await Promise.resolve()
    expect(latePeer.connection.close).toHaveBeenCalledWith(1001)

    lease!.release()
    lease!.release()
    await Promise.resolve()
    expect(settled).toBe(false)

    latePeer.emitClose()
    await closing
    expect(settled).toBe(true)
  })

  it('drains tasks to a fixed point with one cleared grace timer', async () => {
    jest.useFakeTimers()
    const scope = {}
    const first = deferred()
    const second = deferred()
    const firstTask = first.promise.then(() => {
      trackWebSocketTask(second.promise, scope)
    })
    trackWebSocketTask(firstTask, scope)

    let settled = false
    const closing = closeWebSocketScope(scope).then(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    first.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(settled).toBe(false)
    second.resolve()
    await closing
    expect(jest.getTimerCount()).toBe(0)
  })

  it('bounds stuck tasks and observes one late rejection after the grace', async () => {
    jest.useFakeTimers()
    const scope = {}
    trackWebSocketTask(new Promise<void>(() => {}), scope)

    let settled = false
    const closing = closeWebSocketScope(scope).then(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(4_999)
    expect(settled).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    await closing
    expect(settled).toBe(true)
    expect(jest.getTimerCount()).toBe(0)

    const lateFailure = new Error('late task failed')
    const lateTask = deferred()
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
    trackWebSocketTask(lateTask.promise, scope)
    trackWebSocketTask(lateTask.promise, scope)
    lateTask.reject(lateFailure)
    await Promise.resolve()
    await Promise.resolve()

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      'WebSocket lifecycle task failed after shutdown completed:',
      lateFailure
    )
  })

  it('observes tasks offered after an empty terminal drain', async () => {
    const scope = {}
    const drain = closeWebSocketScope(scope)
    await drain

    const lateFailure = new Error('post-shutdown task failed')
    const lateTask = deferred()
    const consoleError = jest.spyOn(console, 'error').mockImplementation()
    trackWebSocketTask(lateTask.promise, scope)
    trackWebSocketTask(lateTask.promise, scope)
    lateTask.reject(lateFailure)
    await Promise.resolve()
    await Promise.resolve()

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith(
      'WebSocket lifecycle task failed after shutdown completed:',
      lateFailure
    )
    expect(closeWebSocketScope(scope)).toBe(drain)
    await expect(closeWebSocketScope(scope)).resolves.toBeUndefined()
  })

  it('preserves peer and task failure identity after attempting both', async () => {
    const scope = {}
    const peerFailure = new Error('peer close failed')
    const taskFailure = new Error('close task failed')
    const task = deferred()
    const peer = createConnection()
    ;(peer.connection.close as jest.Mock).mockImplementation(() => {
      trackWebSocketTask(task.promise, scope)
      throw peerFailure
    })
    registerWebSocketPeer(peer.connection, scope)

    const closing = closeWebSocketScope(scope)
    await Promise.resolve()
    await Promise.resolve()
    task.reject(taskFailure)
    const error = await closing.catch((caught) => caught)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toEqual([peerFailure, taskFailure])
    expect(closeWebSocketScope(scope)).toBe(closing)
    await expect(closeWebSocketScope(scope)).rejects.toBe(error)
  })

  it('waits briefly for an asynchronous close event after termination', async () => {
    jest.useFakeTimers()
    const scope = {}
    const peer = createConnection()
    const hookTask = deferred()
    ;(peer.connection.terminate as jest.Mock).mockImplementation(() => {
      setTimeout(() => {
        trackWebSocketTask(hookTask.promise, scope)
        peer.emitClose()
      }, 10)
    })
    registerWebSocketPeer(peer.connection, scope)

    let settled = false
    const closing = closeWebSocketScope(scope).then(() => {
      settled = true
    })
    await Promise.resolve()
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(5_000)
    expect(peer.connection.terminate).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)
    await jest.advanceTimersByTimeAsync(10)
    expect(settled).toBe(false)

    hookTask.resolve()
    await closing
    expect(settled).toBe(true)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('settles every shutdown stage before reporting failures', async () => {
    const first = new Error('first')
    const second = new Error('second')
    const firstStage = deferred()
    const completed: string[] = []

    const settling = settleWebSocketShutdownStages(
      [
        async () => {
          completed.push('first-start')
          await firstStage.promise
          completed.push('first')
          throw first
        },
        async () => {
          completed.push('second')
          throw second
        },
        () => {
          completed.push('third')
        },
      ],
      'shutdown failed'
    )

    await Promise.resolve()
    expect(completed).toEqual(['first-start'])
    firstStage.resolve()
    const error = await settling.catch((caught) => caught)

    expect(completed).toEqual(['first-start', 'first', 'second', 'third'])
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toEqual([first, second])
  })
})
