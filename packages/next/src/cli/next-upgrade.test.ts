import { EventEmitter } from 'events'
import * as Log from '../build/output/log'

const mockSpawn = jest.fn()

jest.mock('next/dist/compiled/cross-spawn', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSpawn(...args),
}))

jest.mock('../build/output/log', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}))

const { spawnNextUpgrade } =
  require('./next-upgrade') as typeof import('./next-upgrade')

class MockChildProcess extends EventEmitter {
  pid = 1234
}

describe('spawnNextUpgrade', () => {
  let child: MockChildProcess
  let initialExitCode: number | undefined

  beforeEach(() => {
    jest.clearAllMocks()
    child = new MockChildProcess()
    mockSpawn.mockReturnValue(child)
    initialExitCode = process.exitCode
  })

  afterEach(() => {
    process.exitCode = initialExitCode
  })

  it('spawns upgrade process with cross-spawn and default options', () => {
    spawnNextUpgrade(undefined, {
      revision: 'canary',
      verbose: false,
    })

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const [command, args, options] = mockSpawn.mock.calls[0]

    expect(command).toBe('npx')
    expect(args).toEqual([
      '--yes',
      '@next/codemod@canary',
      'upgrade',
      'canary',
    ])
    expect(options).toMatchObject({
      stdio: 'inherit',
    })
  })

  it('passes --verbose flag when verbose option is true', () => {
    spawnNextUpgrade(undefined, {
      revision: 'latest',
      verbose: true,
    })

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const [, args] = mockSpawn.mock.calls[0]
    expect(args).toContain('--verbose')
    expect(args).toEqual([
      '--yes',
      '@next/codemod@canary',
      'upgrade',
      'latest',
      '--verbose',
    ])
  })

  it('passes specific revision to codemod upgrade', () => {
    spawnNextUpgrade(undefined, {
      revision: '15.0.0',
      verbose: false,
    })

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const [, args] = mockSpawn.mock.calls[0]
    expect(args).toEqual([
      '--yes',
      '@next/codemod@canary',
      'upgrade',
      '15.0.0',
    ])
  })

  it('sets process.exitCode on close event', () => {
    spawnNextUpgrade(undefined, {
      revision: 'canary',
      verbose: false,
    })

    child.emit('close', 0)
    expect(process.exitCode).toBe(0)

    child.emit('close', 2)
    expect(process.exitCode).toBe(2)
  })

  it('handles child process error event gracefully without throwing', () => {
    spawnNextUpgrade(undefined, {
      revision: 'canary',
      verbose: false,
    })

    const testError = new Error('spawn npx ENOENT')
    child.emit('error', testError)

    expect(Log.error).toHaveBeenCalledWith('spawn npx ENOENT')
    expect(process.exitCode).toBe(1)
  })
})
