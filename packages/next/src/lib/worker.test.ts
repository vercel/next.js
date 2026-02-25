import { PassThrough } from 'stream'

let latestPoolOptions: any | undefined

jest.mock('./worker/worker-pool', () => {
  class WorkerPoolMock {
    constructor(options: any) {
      latestPoolOptions = options
    }
    dispatch() {
      return Promise.resolve(undefined)
    }
    getStdout() {
      return new PassThrough()
    }
    getStderr() {
      return new PassThrough()
    }
    getWorkerCount() {
      return 0
    }
    end() {
      return Promise.resolve({ forceExited: false })
    }
    close() {}
  }

  return { WorkerPool: WorkerPoolMock }
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
})

describe('lib/worker lazy spawning', () => {
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
})
