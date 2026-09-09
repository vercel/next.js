import { PassThrough } from 'stream'

let latestForkEnv: NodeJS.ProcessEnv | undefined
let latestStdout: PassThrough | undefined
let latestStderr: PassThrough | undefined
let latestEnd: jest.Mock | undefined
let latestKill: jest.Mock | undefined

jest.mock('next/dist/compiled/jest-worker', () => {
  const WorkerMock = jest.fn().mockImplementation((_path, options) => {
    latestForkEnv = options?.forkOptions?.env
    latestStdout = new PassThrough()
    latestStderr = new PassThrough()
    latestEnd = jest.fn().mockResolvedValue({ forceExited: false })
    latestKill = jest.fn()

    return {
      _workerPool: {
        _workers: [{ _child: { kill: latestKill, on: jest.fn() } }],
      },
      getStdout: () => latestStdout,
      getStderr: () => latestStderr,
      end: latestEnd,
      close: jest.fn(),
    }
  })

  return { Worker: WorkerMock }
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
    latestStdout?.end()
    latestStderr?.end()
    jest.resetModules()
    latestForkEnv = undefined
    latestStdout = undefined
    latestStderr = undefined
    latestEnd = undefined
    latestKill = undefined
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

    expect(latestForkEnv?.FORCE_COLOR).toBe('1')
  })

  it('does not overwrite existing FORCE_COLOR', () => {
    process.env.FORCE_COLOR = '0'

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestForkEnv?.FORCE_COLOR).toBe('0')
  })

  it('respects NO_COLOR', () => {
    delete process.env.FORCE_COLOR
    process.env.NO_COLOR = '1'

    overrideBooleanDescriptor(process.stdout, 'isTTY', true)

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestForkEnv?.FORCE_COLOR).toBeUndefined()
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

    expect(latestForkEnv?.FORCE_COLOR).toBeUndefined()
  })
})

describe('lib/worker shutdown', () => {
  afterEach(() => {
    latestStdout?.end()
    latestStderr?.end()
    jest.useRealTimers()
    jest.resetModules()
    latestForkEnv = undefined
    latestStdout = undefined
    latestStderr = undefined
    latestEnd = undefined
    latestKill = undefined
  })

  it('waits for stdout and stderr to drain without interrupting the worker', async () => {
    const { Worker } = require('./worker') as typeof import('./worker')
    const worker = new Worker(__filename, noopOptions)

    let didEnd = false
    const endPromise = worker.end().then((result) => {
      didEnd = true
      return result
    })

    await Promise.resolve()
    expect(latestEnd).toHaveBeenCalledTimes(1)
    expect(latestKill).not.toHaveBeenCalled()
    expect(didEnd).toBe(false)

    latestStdout!.end()
    await Promise.resolve()
    expect(didEnd).toBe(false)

    latestStderr!.end()
    await expect(endPromise).resolves.toEqual({ forceExited: false })
  })

  it('bounds the output drain wait', async () => {
    jest.useFakeTimers()
    const { Worker } = require('./worker') as typeof import('./worker')
    const worker = new Worker(__filename, noopOptions)

    const endPromise = worker.end()
    await Promise.resolve()

    jest.advanceTimersByTime(1000)
    await expect(endPromise).resolves.toEqual({ forceExited: false })
    expect(latestKill).toHaveBeenCalledWith('SIGINT')
  })
})
