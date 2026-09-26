import { PassThrough } from 'stream'

let latestForkEnv: NodeJS.ProcessEnv | undefined
let latestForkExecArgv: string[] | undefined

jest.mock('next/dist/compiled/jest-worker', () => {
  const WorkerMock = jest.fn().mockImplementation((_path, options) => {
    latestForkEnv = options?.forkOptions?.env
    latestForkExecArgv = options?.forkOptions?.execArgv
    return {
      _workerPool: { _workers: [] },
      getStdout: () => new PassThrough(),
      getStderr: () => new PassThrough(),
      end: jest.fn().mockResolvedValue(undefined),
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
  const originalExecArgv = [...process.execArgv]

  const restoreEnv = () => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  }

  afterEach(() => {
    restoreEnv()
    process.execArgv.splice(0, process.execArgv.length, ...originalExecArgv)
    while (restoreDescriptors.length > 0) {
      const restore = restoreDescriptors.pop()
      restore?.()
    }
    jest.resetModules()
    latestForkEnv = undefined
    latestForkExecArgv = undefined
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

  it('does not forward node watch options to child process workers', () => {
    process.execArgv.push(
      '--watch',
      '--watch-path=app',
      '--watch-preserve-output',
      '--experimental-network-inspection'
    )

    const { Worker } = require('./worker') as typeof import('./worker')

    const worker = new Worker(__filename, noopOptions)
    worker.close()

    expect(latestForkExecArgv).toContain('--experimental-network-inspection')
    expect(latestForkExecArgv).not.toContain('--watch')
    expect(latestForkExecArgv).not.toContain('--watch-path=app')
    expect(latestForkExecArgv).not.toContain('--watch-preserve-output')
    expect(latestForkEnv?.NODE_OPTIONS).not.toContain('--watch')
    expect(latestForkEnv?.NODE_OPTIONS).not.toContain('--watch-path')
    expect(latestForkEnv?.NODE_OPTIONS).not.toContain('--watch-preserve-output')
  })
})
