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
    // Like the real pool, end the merged output streams before resolving.
    this._stdout.end()
    this._stderr.end()
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

// Worker adds one async method per entry in `exposedMethods` at runtime.
type WorkerWithExposedMethods = InstanceType<typeof import('./worker').Worker> &
  Record<string, (...args: unknown[]) => Promise<unknown>>

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
      // TODO(as-any): pre-existing cast, not yet reviewed
      // eslint-disable-next-line @next/internal/no-as-any
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
    }) as WorkerWithExposedMethods

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
    }) as WorkerWithExposedMethods

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
    }) as WorkerWithExposedMethods

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
    }) as WorkerWithExposedMethods

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
    }) as WorkerWithExposedMethods

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

  it('shutdown() resolves only after worker output reached the parent streams', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    const pool = latestPoolInstance!
    // The pool's last output, then the pool ends its streams and resolves.
    pool.shutdown = () => {
      pool._shutdown = true
      pool._stderr.write('first\n')
      pool._stderr.write('final diagnostic\n')
      pool._stderr.end()
      pool._stdout.end()
      return Promise.resolve({ forceExited: false })
    }
    // The parent's stderr is busy: the first write applies backpressure, so
    // the rest is only forwarded after 'drain'.
    const stderrWrites: string[] = []
    const stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrWrites.push(chunk.toString())
        return stderrWrites.length > 1
      })
    const flushTicks = async () => {
      for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => process.nextTick(resolve))
      }
    }
    try {
      let resolved = false
      const shutdownPromise = worker.shutdown().then((r) => {
        resolved = true
        return r
      })
      await flushTicks()
      expect(stderrWrites).toEqual(['first\n'])
      expect(resolved).toBe(false)

      process.stderr.emit('drain')
      expect(await shutdownPromise).toEqual({ forceExited: false })
      expect(stderrWrites.join('')).toBe('first\nfinal diagnostic\n')
    } finally {
      stderrSpy.mockRestore()
    }
  })

  it('shutdown() rejects when called after shutdownNow()', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.shutdownNow()

    await expect(worker.shutdown()).rejects.toThrow(
      'Worker is ended, no more calls can be done to it'
    )
  })

  it('shutdown() rejects when called twice', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    await worker.shutdown()

    await expect(worker.shutdown()).rejects.toThrow(
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

  it("keeps the parent's CLI flags as execArgv and NODE_OPTIONS as NODE_OPTIONS", () => {
    const originalExecArgv = process.execArgv
    process.execArgv = ['--max-old-space-size=3000', '--prof', '--inspect']
    process.env.NODE_OPTIONS = '--max-old-space-size=2048 --inspect-wait'
    try {
      const { Worker } = require('./worker') as typeof import('./worker')

      const worker = new Worker(__filename, noopOptions)
      worker.shutdownNow()

      // CLI flags stay CLI flags (so they keep precedence over NODE_OPTIONS,
      // and flags NODE_OPTIONS rejects keep working), minus debugger flags.
      expect(latestPoolOptions?.forkOptions?.execArgv).toEqual([
        '--max-old-space-size=3000',
        '--prof',
      ])
      const env = latestPoolOptions?.forkOptions?.env
      expect(env?.NODE_OPTIONS).toBe('--max-old-space-size=2048')
      expect(env?.IS_NEXT_WORKER).toBe('true')
    } finally {
      process.execArgv = originalExecArgv
    }
  })

  it('sanitizes NODE_OPTIONS passed in forkOptions.env', () => {
    process.env.NODE_OPTIONS = '--conditions=parent'
    const { Worker } = require('./worker') as typeof import('./worker')

    let worker = new Worker(__filename, {
      ...noopOptions,
      forkOptions: { env: { NODE_OPTIONS: '--conditions=own --inspect' } },
    })
    worker.shutdownNow()
    expect(latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS).toBe(
      '--conditions=own'
    )

    // An explicit `undefined` removes the parent's NODE_OPTIONS.
    worker = new Worker(__filename, {
      ...noopOptions,
      forkOptions: { env: { NODE_OPTIONS: undefined } },
    })
    worker.shutdownNow()
    expect(latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS).toBe('')
  })

  it('strips --inspect-wait from NODE_OPTIONS and execArgv', () => {
    const originalExecArgv = process.execArgv
    process.execArgv = ['--inspect-wait=127.0.0.1:9444']
    process.env.NODE_OPTIONS = '--inspect-wait --enable-source-maps'
    try {
      const { Worker } = require('./worker') as typeof import('./worker')

      for (const debuggerPortOffset of [undefined, 0]) {
        const worker = new Worker(__filename, {
          ...noopOptions,
          debuggerPortOffset,
        })
        worker.shutdownNow()

        const nodeOptions =
          latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS ?? ''
        expect(nodeOptions).not.toContain('inspect')
        expect(nodeOptions).toContain('enable-source-maps')
        expect(latestPoolOptions?.forkOptions?.execArgv).toEqual([])
      }
    } finally {
      process.execArgv = originalExecArgv
    }
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

  it('strips --max-old-space-size and debugger flags (with separate values) from the CLI flags', () => {
    const originalExecArgv = process.execArgv
    process.execArgv = [
      '--max-old-space-size=4096',
      '--enable-source-maps',
      '--max_old_space_size=1',
      '--inspect-port',
      '9229',
    ]
    try {
      const { Worker } = require('./worker') as typeof import('./worker')

      const worker = new Worker(__filename, {
        ...noopOptions,
        isolatedMemory: true,
      })
      worker.shutdownNow()

      expect(latestPoolOptions?.forkOptions?.execArgv).toEqual([
        '--enable-source-maps',
      ])
    } finally {
      process.execArgv = originalExecArgv
    }
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

  it('lets enableSourceMaps win over an inherited --no-enable-source-maps', () => {
    const originalExecArgv = process.execArgv
    process.execArgv = ['--no-enable-source-maps', '--conditions=foo']
    try {
      const { Worker } = require('./worker') as typeof import('./worker')

      const worker = new Worker(__filename, {
        ...noopOptions,
        enableSourceMaps: true,
      })
      worker.shutdownNow()

      expect(latestPoolOptions?.forkOptions?.execArgv).toEqual([
        '--conditions=foo',
      ])
      expect(latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS).toBe(
        '--enable-source-maps'
      )
    } finally {
      process.execArgv = originalExecArgv
    }
  })

  it('re-attaches the debugger where the parent inspector listens, with publish-uid', () => {
    const originalExecArgv = process.execArgv
    const inspectorUrl = jest.spyOn(
      require('inspector') as typeof import('inspector'),
      'url'
    )
    process.execArgv = [
      '--inspect=127.0.0.1:9300',
      '--inspect-publish-uid=http',
    ]
    process.env.NODE_OPTIONS = '--inspect=127.0.0.1:9500'
    try {
      const { Worker } = require('./worker') as typeof import('./worker')

      inspectorUrl.mockReturnValue('ws://127.0.0.1:9300/uuid')
      let worker = new Worker(__filename, {
        ...noopOptions,
        debuggerPortOffset: 2,
      })
      worker.shutdownNow()

      expect(latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS).toBe(
        '--inspect=127.0.0.1:9303 --inspect-publish-uid=http'
      )
      expect(latestPoolOptions?.forkOptions?.execArgv).toEqual([])

      // Worker threads can't own a debugger port.
      worker = new Worker(__filename, {
        ...noopOptions,
        debuggerPortOffset: 2,
        enableWorkerThreads: true,
      })
      worker.shutdownNow()
      expect(latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS).toBe('')
      expect(latestPoolOptions?.forkOptions?.execArgv).toEqual([])

      // The flags say wildcard, but Node.js resolved the later overrides to
      // loopback: the worker follows Node.js, and no stale address reaches it.
      process.execArgv = [
        '--inspect',
        '--inspect-port=0.0.0.0:9320',
        '--debug-port',
        '127.0.0.1:9330',
      ]
      process.env.NODE_OPTIONS = '--inspect-port=0.0.0.0:9340'
      inspectorUrl.mockReturnValue('ws://127.0.0.1:9330/uuid')
      worker = new Worker(__filename, {
        ...noopOptions,
        debuggerPortOffset: 0,
      })
      worker.shutdownNow()
      expect(latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS).toBe(
        '--inspect=127.0.0.1:9331'
      )
      expect(latestPoolOptions?.forkOptions?.execArgv).toEqual([])

      // An inspector that isn't running (e.g. `--no-inspect`) isn't re-attached.
      process.execArgv = ['--no-inspect']
      process.env.NODE_OPTIONS = '--inspect=0.0.0.0:9350'
      inspectorUrl.mockReturnValue(undefined)
      worker = new Worker(__filename, {
        ...noopOptions,
        debuggerPortOffset: 0,
      })
      worker.shutdownNow()
      expect(latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS).toBe('')
      // The negation itself is kept, which only disables the inspector.
      expect(latestPoolOptions?.forkOptions?.execArgv).toEqual(['--no-inspect'])

      // Enabled but not started (e.g. port taken): Node's port, on loopback.
      process.execArgv = []
      process.env.NODE_OPTIONS = '--inspect'
      worker = new Worker(__filename, {
        ...noopOptions,
        debuggerPortOffset: 0,
      })
      worker.shutdownNow()
      expect(latestPoolOptions?.forkOptions?.env?.NODE_OPTIONS).toBe(
        `--inspect=127.0.0.1:${process.debugPort + 1}`
      )
    } finally {
      process.execArgv = originalExecArgv
      inspectorUrl.mockRestore()
    }
  })

  it('tells the pool which flags are inherited from the parent', () => {
    const originalExecArgv = process.execArgv
    process.execArgv = ['--max-old-space-size=3000', '--inspect']
    try {
      const { Worker } = require('./worker') as typeof import('./worker')

      const worker = new Worker(__filename, {
        ...noopOptions,
        forkOptions: { execArgv: ['--stack-size=1200'] },
      })
      worker.shutdownNow()

      expect(latestPoolOptions?.forkOptions?.execArgv).toEqual([
        '--max-old-space-size=3000',
        '--stack-size=1200',
      ])
      expect(latestPoolOptions?.inheritedExecArgv).toEqual([
        '--max-old-space-size=3000',
      ])
    } finally {
      process.execArgv = originalExecArgv
    }
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
    }) as WorkerWithExposedMethods

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
    }) as WorkerWithExposedMethods

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
    }) as WorkerWithExposedMethods

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
    }) as WorkerWithExposedMethods

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
    }) as WorkerWithExposedMethods

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
    }) as WorkerWithExposedMethods

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
    }) as WorkerWithExposedMethods

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
