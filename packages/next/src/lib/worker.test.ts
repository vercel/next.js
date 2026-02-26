import { PassThrough } from 'stream'

let latestPoolOptions: any | undefined
let latestPoolInstance: WorkerPoolMock | undefined

class WorkerPoolMock {
  options: any
  dispatches: Array<{ method: string; args: unknown[] }> = []
  _dispatchResult: unknown = undefined
  _dispatchError: Error | undefined = undefined
  _stdout = new PassThrough()
  _stderr = new PassThrough()
  _closed = false
  _ended = false

  constructor(options: any) {
    latestPoolOptions = options
    latestPoolInstance = this
    this.options = options
  }

  dispatch(method: string, args: unknown[]) {
    this.dispatches.push({ method, args })
    if (this._dispatchError) {
      return Promise.reject(this._dispatchError)
    }
    return Promise.resolve(this._dispatchResult)
  }

  getStdout() {
    return this._stdout
  }

  getStderr() {
    return this._stderr
  }

  getWorkerCount() {
    return 0
  }

  end() {
    this._ended = true
    return Promise.resolve({ forceExited: false })
  }

  close() {
    this._closed = true
  }
}

class WorkerExitErrorMock extends Error {
  code: number | null
  signal: string | null
  constructor(code: number | null, signal: string | null) {
    super(
      `Worker exited unexpectedly with code ${code}${signal ? `, signal ${signal}` : ''}`
    )
    this.name = 'WorkerExitError'
    this.code = code
    this.signal = signal
  }
}

jest.mock('./worker/worker-pool', () => {
  return { WorkerPool: WorkerPoolMock, WorkerExitError: WorkerExitErrorMock }
})

const noopOptions = {
  debuggerPortOffset: -1,
  isolatedMemory: false,
  exposedMethods: [] as string[],
}

const restoreDescriptors: Array<() => void> = []

const overrideBooleanDescriptor = (
  target: NodeJS.WriteStream,
  property: 'isTTY',
  value: boolean | undefined
) => {
  const descriptor = Object.getOwnPropertyDescriptor(target, property)
  restoreDescriptors.push(() => {
    if (descriptor) {
      Object.defineProperty(target, property, descriptor)
    } else {
      delete (target as any)[property]
    }
  })
  Object.defineProperty(target, property, {
    configurable: true,
    enumerable: false,
    value,
    writable: true,
  })
}

describe('lib/worker color propagation', () => {
  const originalEnv = { ...process.env }

  const restoreEnv = () => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  }

  afterEach(() => {
    restoreEnv()
    while (restoreDescriptors.length > 0) {
      const restore = restoreDescriptors.pop()
      restore?.()
    }
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('enables FORCE_COLOR when the parent supports colors', () => {
    delete process.env.FORCE_COLOR
    delete process.env.NO_COLOR
    delete process.env.CI
    process.env.TERM = 'xterm-256color'

    overrideBooleanDescriptor(process.stdout, 'isTTY', true)
    overrideBooleanDescriptor(process.stderr, 'isTTY', false)

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBe('1')
  })

  it('does not overwrite existing FORCE_COLOR', () => {
    process.env.FORCE_COLOR = '0'

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBe('0')
  })

  it('respects NO_COLOR', () => {
    delete process.env.FORCE_COLOR
    process.env.NO_COLOR = '1'

    overrideBooleanDescriptor(process.stdout, 'isTTY', true)

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBeUndefined()
  })

  it('does not force color when not attached to a TTY', () => {
    delete process.env.FORCE_COLOR
    delete process.env.CI
    delete process.env.NO_COLOR
    process.env.TERM = 'xterm-256color'

    overrideBooleanDescriptor(process.stdout, 'isTTY', false)
    overrideBooleanDescriptor(process.stderr, 'isTTY', false)

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBeUndefined()
  })

  it('does not force color when CI is set', () => {
    delete process.env.FORCE_COLOR
    delete process.env.NO_COLOR
    process.env.CI = 'true'

    overrideBooleanDescriptor(process.stdout, 'isTTY', true)

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBeUndefined()
  })

  it('does not force color when TERM is dumb', () => {
    delete process.env.FORCE_COLOR
    delete process.env.NO_COLOR
    delete process.env.CI
    process.env.TERM = 'dumb'

    overrideBooleanDescriptor(process.stdout, 'isTTY', true)

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBeUndefined()
  })

  it('enables FORCE_COLOR when stderr is TTY but stdout is not', () => {
    delete process.env.FORCE_COLOR
    delete process.env.NO_COLOR
    delete process.env.CI
    process.env.TERM = 'xterm-256color'

    overrideBooleanDescriptor(process.stdout, 'isTTY', false)
    overrideBooleanDescriptor(process.stderr, 'isTTY', true)

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBe('1')
  })
})

describe('lib/worker lazy spawning', () => {
  afterEach(() => {
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('passes numWorkers as maxWorkers to WorkerPool', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      numWorkers: 4,
    })
    worker.close()

    expect(latestPoolOptions?.maxWorkers).toBe(4)
  })

  it('defaults to 1 maxWorker when numWorkers is not set', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.maxWorkers).toBe(1)
  })

  it('wires up exposed methods to call pool.dispatch', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      exposedMethods: ['testMethod'],
    }) as any

    expect(typeof worker.testMethod).toBe('function')

    // Calling the method should dispatch to the pool
    const result = await worker.testMethod('arg1', 'arg2')
    expect(result).toBeUndefined() // mock resolves with undefined

    worker.close()
  })

  it('passes concurrencyPerWorker option to WorkerPool', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      concurrencyPerWorker: 5,
    })
    worker.close()

    expect(latestPoolOptions?.concurrencyPerWorker).toBe(5)
  })

  it('defaults concurrencyPerWorker to 1', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.concurrencyPerWorker).toBe(1)
  })

  it('passes enableWorkerThreads option to WorkerPool', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      enableWorkerThreads: true,
    })
    worker.close()

    expect(latestPoolOptions?.enableWorkerThreads).toBe(true)
  })

  it('defaults enableWorkerThreads to false', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.enableWorkerThreads).toBe(false)
  })

  it('does not pass maxRespawns to WorkerPool', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      maxRetries: 3,
    })
    worker.close()

    expect(latestPoolOptions?.maxRespawns).toBeUndefined()
  })
})

describe('lib/worker exposed methods', () => {
  afterEach(() => {
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('does not expose methods starting with underscore', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      exposedMethods: ['publicMethod', '_privateMethod', '__internal'],
    }) as any

    expect(typeof worker.publicMethod).toBe('function')
    expect(worker._privateMethod).toBeUndefined()
    expect(worker.__internal).toBeUndefined()

    worker.close()
  })

  it('dispatches to pool with correct method name and args', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      exposedMethods: ['compute'],
    }) as any

    await worker.compute('hello', 42, true)

    expect(latestPoolInstance!.dispatches).toHaveLength(1)
    expect(latestPoolInstance!.dispatches[0].method).toBe('compute')
    expect(latestPoolInstance!.dispatches[0].args).toEqual(['hello', 42, true])

    worker.close()
  })

  it('returns the result from pool.dispatch', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      exposedMethods: ['compute'],
    }) as any

    latestPoolInstance!._dispatchResult = { sum: 42 }

    const result = await worker.compute(1, 2)
    expect(result).toEqual({ sum: 42 })

    worker.close()
  })

  it('propagates errors from pool.dispatch', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      exposedMethods: ['failMethod'],
    }) as any

    latestPoolInstance!._dispatchError = new Error('worker crashed')

    await expect(worker.failMethod()).rejects.toThrow('worker crashed')

    worker.close()
  })

  it('sanitizes args when enableWorkerThreads is true', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      enableWorkerThreads: true,
      exposedMethods: ['doWork'],
    }) as any

    // Functions are not serializable with structured clone; sanitization
    // via JSON round-trip should strip them
    await worker.doWork({ key: 'value', fn: () => {} })

    expect(latestPoolInstance!.dispatches).toHaveLength(1)
    const args = latestPoolInstance!.dispatches[0].args
    expect(args).toEqual([{ key: 'value' }])

    worker.close()
  })

  it('does not sanitize args when enableWorkerThreads is false', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      enableWorkerThreads: false,
      exposedMethods: ['doWork'],
    }) as any

    const fn = () => {}
    await worker.doWork({ key: 'value', fn })

    expect(latestPoolInstance!.dispatches).toHaveLength(1)
    const args = latestPoolInstance!.dispatches[0].args
    // Function should still be present (not sanitized)
    expect((args[0] as any).fn).toBe(fn)

    worker.close()
  })
})

describe('lib/worker end and close', () => {
  afterEach(() => {
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('end() delegates to pool.end()', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)

    const result = await worker.end()
    expect(result).toEqual({ forceExited: false })
    expect(latestPoolInstance!._ended).toBe(true)
  })

  it('end() throws when called after close()', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(() => worker.end()).toThrow(
      'Farm is ended, no more calls can be done to it'
    )
  })

  it('end() throws when called twice', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    await worker.end()

    expect(() => worker.end()).toThrow(
      'Farm is ended, no more calls can be done to it'
    )
  })

  it('close() delegates to pool.close()', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolInstance!._closed).toBe(true)
  })

  it('close() is idempotent (safe to call multiple times)', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()
    worker.close() // should not throw
    worker.close() // should not throw
  })
})

describe('lib/worker env configuration', () => {
  const originalEnv = { ...process.env }

  const restoreEnv = () => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  }

  afterEach(() => {
    restoreEnv()
    while (restoreDescriptors.length > 0) {
      const restore = restoreDescriptors.pop()
      restore?.()
    }
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('sets IS_NEXT_WORKER in worker env', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestPoolOptions?.forkOptions?.env?.IS_NEXT_WORKER).toBe('true')
  })

  it('merges forkOptions.env into worker env', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      forkOptions: {
        env: { CUSTOM_VAR: 'custom_value' },
      },
    })
    worker.close()

    expect(latestPoolOptions?.forkOptions?.env?.CUSTOM_VAR).toBe('custom_value')
  })

  it('strips --max-old-space-size from NODE_OPTIONS when isolatedMemory is true', () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096 --enable-source-maps'

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      isolatedMemory: true,
    })
    worker.close()

    const nodeOptions = latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS ?? ''
    expect(nodeOptions).not.toContain('max-old-space-size')
    expect(nodeOptions).toContain('enable-source-maps')
  })

  it('preserves --max-old-space-size when isolatedMemory is false', () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096'

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      isolatedMemory: false,
    })
    worker.close()

    const nodeOptions = latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS ?? ''
    expect(nodeOptions).toContain('max-old-space-size')
  })

  it('adds --enable-source-maps when enableSourceMaps is true', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      enableSourceMaps: true,
    })
    worker.close()

    const nodeOptions = latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS ?? ''
    expect(nodeOptions).toContain('enable-source-maps')
  })
})

describe('lib/worker timeout and activity', () => {
  afterEach(() => {
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('calls onActivity when an exposed method is invoked', async () => {
    const onActivity = jest.fn()

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      timeout: 5000,
      onActivity,
      exposedMethods: ['doWork'],
    }) as any

    await worker.doWork()

    expect(onActivity).toHaveBeenCalled()

    worker.close()
  })

  it('calls setOnActivity to update the activity callback', async () => {
    const onActivity1 = jest.fn()
    const onActivity2 = jest.fn()

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      timeout: 5000,
      onActivity: onActivity1,
      exposedMethods: ['doWork'],
    }) as any

    await worker.doWork()
    expect(onActivity1).toHaveBeenCalledTimes(2) // once on start, once on finish

    worker.setOnActivity(onActivity2)
    await worker.doWork()
    expect(onActivity2).toHaveBeenCalled()

    worker.close()
  })

  it('triggers onCustomMessage callback for activity messages', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const onActivity = jest.fn()

    new Worker(__filename, {
      ...noopOptions,
      timeout: 5000,
      onActivity,
      exposedMethods: ['doWork'],
    })

    // Simulate a custom message with type=activity
    const onCustomMessage = latestPoolOptions?.onCustomMessage
    expect(onCustomMessage).toBeDefined()
    onCustomMessage({ type: 'activity' })

    expect(onActivity).toHaveBeenCalled()
  })

  it('does not trigger onActivity for non-activity custom messages', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const onActivity = jest.fn()

    new Worker(__filename, {
      ...noopOptions,
      timeout: 5000,
      onActivity,
      exposedMethods: [],
    })

    const onCustomMessage = latestPoolOptions?.onCustomMessage
    onCustomMessage({ type: 'other' })

    expect(onActivity).not.toHaveBeenCalled()
  })

  it('recreates pool on timeout', async () => {
    jest.useFakeTimers()

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      timeout: 1000,
      exposedMethods: ['slowMethod'],
    }) as any

    const firstPool = latestPoolInstance!

    // Start a task that will cause the timer to start
    // The mock resolves immediately, but the timeout timer is set before await
    const promise = worker.slowMethod()
    await promise

    // Dispatch again to create an active task scenario
    // We need to make the dispatch hang to trigger the timeout
    let resolveHanging: (v: unknown) => void
    firstPool.dispatch = () =>
      new Promise((resolve) => {
        resolveHanging = resolve
      })

    const hangingPromise = worker.slowMethod()

    // Advance time past the timeout
    jest.advanceTimersByTime(1001)

    // A new pool should have been created
    expect(latestPoolInstance).not.toBe(firstPool)
    expect(firstPool._ended).toBe(true)

    // Clean up
    resolveHanging!(undefined)
    await hangingPromise.catch(() => {})
    worker.close()

    jest.useRealTimers()
  })
})

describe('lib/worker maxRetries', () => {
  afterEach(() => {
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('retries dispatch on WorkerExitError up to maxRetries times', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      maxRetries: 2,
      exposedMethods: ['compute'],
    }) as any

    let callCount = 0
    latestPoolInstance!.dispatch = () => {
      callCount++
      if (callCount <= 2) {
        return Promise.reject(new WorkerExitErrorMock(1, null))
      }
      return Promise.resolve('success')
    }

    const result = await worker.compute()
    expect(result).toBe('success')
    expect(callCount).toBe(3) // 1 initial + 2 retries

    worker.close()
  })

  it('does not retry when maxRetries is 0', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      maxRetries: 0,
      exposedMethods: ['compute'],
    }) as any

    latestPoolInstance!.dispatch = () => {
      return Promise.reject(new WorkerExitErrorMock(1, null))
    }

    await expect(worker.compute()).rejects.toThrow(
      'Worker exited unexpectedly with code 1'
    )

    worker.close()
  })

  it('does not retry on non-crash errors', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      maxRetries: 3,
      exposedMethods: ['compute'],
    }) as any

    let callCount = 0
    latestPoolInstance!.dispatch = () => {
      callCount++
      return Promise.reject(new Error('method error'))
    }

    await expect(worker.compute()).rejects.toThrow('method error')
    expect(callCount).toBe(1) // no retries

    worker.close()
  })

  it('calls onRestart on each retry', async () => {
    const onRestart = jest.fn()
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      maxRetries: 2,
      onRestart,
      exposedMethods: ['compute'],
    }) as any

    let callCount = 0
    latestPoolInstance!.dispatch = (_method: string, _args: unknown[]) => {
      callCount++
      if (callCount <= 2) {
        return Promise.reject(new WorkerExitErrorMock(1, null))
      }
      return Promise.resolve('ok')
    }

    await worker.compute('arg1')

    expect(onRestart).toHaveBeenCalledTimes(2)
    expect(onRestart).toHaveBeenCalledWith('compute', ['arg1'], 0)
    expect(onRestart).toHaveBeenCalledWith('compute', ['arg1'], 1)

    worker.close()
  })

  it('throws after exhausting all retries', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      maxRetries: 1,
      exposedMethods: ['compute'],
    }) as any

    latestPoolInstance!.dispatch = () => {
      return Promise.reject(new WorkerExitErrorMock(1, null))
    }

    await expect(worker.compute()).rejects.toThrow(
      'Worker exited unexpectedly with code 1'
    )

    worker.close()
  })

  it('does not pass onWorkerExit to the pool', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    new Worker(__filename, noopOptions)

    expect(latestPoolOptions?.onWorkerExit).toBeUndefined()
  })
})

describe('lib/worker exit handler cleanup', () => {
  afterEach(() => {
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('removes process exit listener on end()', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    // Capture the listener list before/after to verify our handler is added/removed
    const listenersBefore = process.listeners('exit').slice()

    const worker = new Worker(__filename, noopOptions)

    const listenersAfter = process.listeners('exit').slice()
    const added = listenersAfter.filter((l) => !listenersBefore.includes(l))
    expect(added).toHaveLength(1)

    await worker.end()

    const listenersEnd = process.listeners('exit').slice()
    const remaining = listenersEnd.filter((l) => !listenersBefore.includes(l))
    expect(remaining).toHaveLength(0)
  })

  it('removes process exit listener on close()', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const listenersBefore = process.listeners('exit').slice()

    const worker = new Worker(__filename, noopOptions)

    const listenersAfter = process.listeners('exit').slice()
    const added = listenersAfter.filter((l) => !listenersBefore.includes(l))
    expect(added).toHaveLength(1)

    worker.close()

    const listenersEnd = process.listeners('exit').slice()
    const remaining = listenersEnd.filter((l) => !listenersBefore.includes(l))
    expect(remaining).toHaveLength(0)
  })

  it('does not leak listeners when creating many workers', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const listenersBefore = process.listeners('exit').slice()

    const workers: InstanceType<typeof Worker>[] = []
    for (let i = 0; i < 20; i++) {
      workers.push(new Worker(__filename, noopOptions))
    }

    const listenersAfter = process.listeners('exit').slice()
    const added = listenersAfter.filter((l) => !listenersBefore.includes(l))
    expect(added).toHaveLength(20)

    for (const w of workers) {
      w.close()
    }

    const listenersEnd = process.listeners('exit').slice()
    const remaining = listenersEnd.filter((l) => !listenersBefore.includes(l))
    expect(remaining).toHaveLength(0)
  })
})
