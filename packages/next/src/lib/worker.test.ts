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
  _shutdownNow = false
  _shutdown = false

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

  shutdown() {
    this._shutdown = true
    return Promise.resolve({ forceExited: false })
  }

  shutdownNow() {
    this._shutdownNow = true
  }
}

class WorkerExitErrorMock extends Error {
  code: number | null
  signal: string | null
  constructor(code: number | null, signal: string | null, workerName?: string) {
    super(
      `${workerName ?? 'Worker'} exited with code: ${code} and signal: ${signal}`
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
    worker.shutdownNow()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBe('1')
  })

  it('does not overwrite existing FORCE_COLOR', () => {
    process.env.FORCE_COLOR = '0'

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.shutdownNow()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBe('0')
  })

  it('respects NO_COLOR', () => {
    delete process.env.FORCE_COLOR
    process.env.NO_COLOR = '1'

    overrideBooleanDescriptor(process.stdout, 'isTTY', true)

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.shutdownNow()

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
    worker.shutdownNow()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBeUndefined()
  })

  it('does not force color when CI is set', () => {
    delete process.env.FORCE_COLOR
    delete process.env.NO_COLOR
    process.env.CI = 'true'

    overrideBooleanDescriptor(process.stdout, 'isTTY', true)

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.shutdownNow()

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
    worker.shutdownNow()

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
    worker.shutdownNow()

    expect(latestPoolOptions?.forkOptions?.env?.FORCE_COLOR).toBe('1')
  })
})

describe('lib/worker lazy spawning', () => {
  afterEach(() => {
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('passes maxWorkers to WorkerPool', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      maxWorkers: 4,
    })
    worker.shutdownNow()

    expect(latestPoolOptions?.maxWorkers).toBe(4)
  })

  it('defaults maxWorkers to os.cpus().length - 1 (minimum 1)', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.shutdownNow()

    const os = require('os') as typeof import('os')
    expect(latestPoolOptions?.maxWorkers).toBe(
      Math.max(os.cpus().length - 1, 1)
    )
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

    worker.shutdownNow()
  })

  it('passes concurrencyPerWorker option to WorkerPool', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      concurrencyPerWorker: 5,
    })
    worker.shutdownNow()

    expect(latestPoolOptions?.concurrencyPerWorker).toBe(5)
  })

  it('defaults concurrencyPerWorker to 1', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.shutdownNow()

    expect(latestPoolOptions?.concurrencyPerWorker).toBe(1)
  })

  it('passes enableWorkerThreads option to WorkerPool', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      enableWorkerThreads: true,
    })
    worker.shutdownNow()

    expect(latestPoolOptions?.enableWorkerThreads).toBe(true)
  })

  it('defaults enableWorkerThreads to false', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.shutdownNow()

    expect(latestPoolOptions?.enableWorkerThreads).toBe(false)
  })

  it('does not pass maxRespawns to WorkerPool', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      maxRetries: 3,
    })
    worker.shutdownNow()

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

    worker.shutdownNow()
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

    worker.shutdownNow()
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

    worker.shutdownNow()
  })

  it('propagates errors from pool.dispatch', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      exposedMethods: ['failMethod'],
    }) as any

    latestPoolInstance!._dispatchError = new Error('worker crashed')

    await expect(worker.failMethod()).rejects.toThrow('worker crashed')

    worker.shutdownNow()
  })
})

describe('lib/worker shutdown and shutdownNow', () => {
  afterEach(() => {
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('shutdown() delegates to pool.shutdown()', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)

    const result = await worker.shutdown()
    expect(result).toEqual({ forceExited: false })
    expect(latestPoolInstance!._shutdown).toBe(true)
  })

  it('shutdown() throws when called after shutdownNow()', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.shutdownNow()

    expect(() => worker.shutdown()).toThrow(
      'Worker is ended, no more calls can be done to it'
    )
  })

  it('shutdown() throws when called twice', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    await worker.shutdown()

    expect(() => worker.shutdown()).toThrow(
      'Worker is ended, no more calls can be done to it'
    )
  })

  it('shutdownNow() delegates to pool.shutdownNow()', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.shutdownNow()

    expect(latestPoolInstance!._shutdownNow).toBe(true)
  })

  it('shutdownNow() is idempotent (safe to call multiple times)', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.shutdownNow()
    worker.shutdownNow() // should not throw
    worker.shutdownNow() // should not throw
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
    worker.shutdownNow()

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
    worker.shutdownNow()

    expect(latestPoolOptions?.forkOptions?.env?.CUSTOM_VAR).toBe('custom_value')
  })

  it('strips --max-old-space-size from NODE_OPTIONS when isolatedMemory is true', () => {
    process.env.NODE_OPTIONS = '--max-old-space-size=4096 --enable-source-maps'

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      isolatedMemory: true,
    })
    worker.shutdownNow()

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
    worker.shutdownNow()

    const nodeOptions = latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS ?? ''
    expect(nodeOptions).toContain('max-old-space-size')
  })

  it('adds --enable-source-maps when enableSourceMaps is true', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      enableSourceMaps: true,
    })
    worker.shutdownNow()

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

  it('passes timeout to WorkerPool', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      timeout: 5000,
    })
    worker.shutdownNow()

    expect(latestPoolOptions?.timeout).toBe(5000)
  })

  it('does not forward onActivity to WorkerPool (activity is driven by onCustomMessage)', () => {
    const onActivity = jest.fn()

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      onActivity,
    })

    // onActivity is NOT forwarded as a pool.onActivity option; it is only
    // triggered via onCustomMessage({type:'activity'}) so that progress
    // updates don't race with console.error output from the worker.
    expect(latestPoolOptions?.onActivity).toBeUndefined()

    // Verify the custom-message path still fires it
    latestPoolOptions.onCustomMessage({ type: 'activity' })
    expect(onActivity).toHaveBeenCalledTimes(1)

    worker.shutdownNow()
  })

  it('calls setOnActivity to update the activity callback', () => {
    const onActivity1 = jest.fn()
    const onActivity2 = jest.fn()

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      onActivity: onActivity1,
    })

    // Activity is triggered via onCustomMessage, not pool.onActivity
    latestPoolOptions.onCustomMessage({ type: 'activity' })
    expect(onActivity1).toHaveBeenCalledTimes(1)

    worker.setOnActivity(onActivity2)
    latestPoolOptions.onCustomMessage({ type: 'activity' })
    expect(onActivity2).toHaveBeenCalledTimes(1)
    // onActivity1 should not have been called again
    expect(onActivity1).toHaveBeenCalledTimes(1)

    worker.shutdownNow()
  })

  it('triggers onActivity callback for activity custom messages', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const onActivity = jest.fn()

    new Worker(__filename, {
      ...noopOptions,
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
      onActivity,
      exposedMethods: [],
    })

    const onCustomMessage = latestPoolOptions?.onCustomMessage
    onCustomMessage({ type: 'other' })

    expect(onActivity).not.toHaveBeenCalled()
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

    worker.shutdownNow()
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
      'Worker exited with code: 1 and signal: null'
    )

    worker.shutdownNow()
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

    worker.shutdownNow()
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

    worker.shutdownNow()
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
      'Worker exited with code: 1 and signal: null'
    )

    worker.shutdownNow()
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

  it('removes process exit listener on shutdown()', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    // Capture the listener list before/after to verify our handler is added/removed
    const listenersBefore = process.listeners('exit').slice()

    const worker = new Worker(__filename, noopOptions)

    const listenersAfter = process.listeners('exit').slice()
    const added = listenersAfter.filter((l) => !listenersBefore.includes(l))
    expect(added).toHaveLength(1)

    await worker.shutdown()

    const listenersEnd = process.listeners('exit').slice()
    const remaining = listenersEnd.filter((l) => !listenersBefore.includes(l))
    expect(remaining).toHaveLength(0)
  })

  it('removes process exit listener on shutdownNow()', () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const listenersBefore = process.listeners('exit').slice()

    const worker = new Worker(__filename, noopOptions)

    const listenersAfter = process.listeners('exit').slice()
    const added = listenersAfter.filter((l) => !listenersBefore.includes(l))
    expect(added).toHaveLength(1)

    worker.shutdownNow()

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
      w.shutdownNow()
    }

    const listenersEnd = process.listeners('exit').slice()
    const remaining = listenersEnd.filter((l) => !listenersBefore.includes(l))
    expect(remaining).toHaveLength(0)
  })
})

describe('lib/worker onActivityAbort', () => {
  afterEach(() => {
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('calls onActivityAbort when worker stdout produces output', async () => {
    const onActivityAbort = jest.fn()
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      onActivityAbort,
    })

    // Write to pool stdout — the Worker pipes it through an abort transform
    latestPoolInstance!._stdout.write('some output')

    // Wait for the piped data to propagate
    await new Promise((r) => setImmediate(r))

    expect(onActivityAbort).toHaveBeenCalledTimes(1)
    worker.shutdownNow()
  })

  it('calls onActivityAbort when worker stderr produces output', async () => {
    const onActivityAbort = jest.fn()
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      onActivityAbort,
    })

    latestPoolInstance!._stderr.write('error output')

    await new Promise((r) => setImmediate(r))

    expect(onActivityAbort).toHaveBeenCalledTimes(1)
    worker.shutdownNow()
  })

  it('fires onActivityAbort only once per registration', async () => {
    const onActivityAbort = jest.fn()
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      onActivityAbort,
    })

    latestPoolInstance!._stdout.write('first')
    latestPoolInstance!._stdout.write('second')

    await new Promise((r) => setImmediate(r))

    expect(onActivityAbort).toHaveBeenCalledTimes(1)
    worker.shutdownNow()
  })

  it('resets the guard when setOnActivityAbort is called', async () => {
    const onActivityAbort1 = jest.fn()
    const onActivityAbort2 = jest.fn()
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      onActivityAbort: onActivityAbort1,
    })

    latestPoolInstance!._stdout.write('first')
    await new Promise((r) => setImmediate(r))
    expect(onActivityAbort1).toHaveBeenCalledTimes(1)

    // Re-register with new callback — resets the dedup guard
    worker.setOnActivityAbort(onActivityAbort2)

    latestPoolInstance!._stdout.write('second')
    await new Promise((r) => setImmediate(r))

    expect(onActivityAbort2).toHaveBeenCalledTimes(1)
    // Original callback should not fire again
    expect(onActivityAbort1).toHaveBeenCalledTimes(1)

    worker.shutdownNow()
  })

  it('does not fire after setOnActivityAbort(undefined)', async () => {
    const onActivityAbort = jest.fn()
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      onActivityAbort,
    })

    worker.setOnActivityAbort(undefined)

    latestPoolInstance!._stdout.write('output')
    await new Promise((r) => setImmediate(r))

    expect(onActivityAbort).not.toHaveBeenCalled()
    worker.shutdownNow()
  })
})

describe('lib/worker workerName in error messages', () => {
  afterEach(() => {
    jest.resetModules()
    latestPoolOptions = undefined
    latestPoolInstance = undefined
  })

  it('includes workerName in WorkerExitError after exhausting retries', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      workerName: 'Next.js export worker',
      maxRetries: 1,
      exposedMethods: ['render'],
    }) as any

    latestPoolInstance!.dispatch = () => {
      return Promise.reject(new WorkerExitErrorMock(1, null))
    }

    try {
      await worker.render()
      throw new Error('should have thrown')
    } catch (err: any) {
      expect(err.message).toBe(
        'Next.js export worker exited with code: 1 and signal: null'
      )
    }

    worker.shutdownNow()
  })

  it('uses default "Worker" when workerName is not set', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, {
      ...noopOptions,
      maxRetries: 0,
      exposedMethods: ['render'],
    }) as any

    latestPoolInstance!.dispatch = () => {
      return Promise.reject(new WorkerExitErrorMock(1, null))
    }

    try {
      await worker.render()
      throw new Error('should have thrown')
    } catch (err: any) {
      expect(err.message).toBe('Worker exited with code: 1 and signal: null')
    }

    worker.shutdownNow()
  })
})
