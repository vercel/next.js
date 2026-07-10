import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

const mockSpawn = jest.fn()

jest.mock('next/dist/compiled/cross-spawn', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSpawn(...args),
}))

const { runTypeScriptCli } =
  require('./runTypeScriptCli') as typeof import('./runTypeScriptCli')

const processEvents = ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP'] as const

type ProcessEvent = (typeof processEvents)[number]
type ProcessListener = (...args: any[]) => void

function getProcessListeners(event: ProcessEvent): ProcessListener[] {
  return (process as EventEmitter).listeners(event) as ProcessListener[]
}

class MockChildProcess extends EventEmitter {
  killed = false
  kill = jest.fn(() => true)
  stdout = new PassThrough()
  stderr = new PassThrough()
}

describe('runTypeScriptCli', () => {
  let child: MockChildProcess
  let originalListeners: Map<ProcessEvent, ProcessListener[]>
  let processKill: jest.SpiedFunction<typeof process.kill>

  beforeEach(() => {
    child = new MockChildProcess()
    mockSpawn.mockReset().mockReturnValue(child as unknown as ChildProcess)
    processKill = jest.spyOn(process, 'kill').mockReturnValue(true)
    originalListeners = new Map(
      processEvents.map((event) => [event, getProcessListeners(event)])
    )
  })

  afterEach(() => {
    for (const event of processEvents) {
      const listenersBeforeTest = originalListeners.get(event)!
      for (const listener of getProcessListeners(event)) {
        if (!listenersBeforeTest.includes(listener)) {
          process.off(event, listener)
        }
      }
    }
    processKill.mockRestore()
  })

  function getAddedListener(event: ProcessEvent): ProcessListener {
    const listenersBeforeTest = originalListeners.get(event)!
    const addedListener = getProcessListeners(event).find(
      (listener) => !listenersBeforeTest.includes(listener)
    )

    expect(addedListener).toBeDefined()
    return addedListener!
  }

  function expectListenersRestored() {
    for (const event of processEvents) {
      expect(getProcessListeners(event)).toEqual(originalListeners.get(event))
    }
  }

  it('forwards SIGTERM to the child and cleans up all listeners on close', async () => {
    const resultPromise = runTypeScriptCli({
      cwd: '/project',
      tscPath: '/project/node_modules/typescript/bin/tsc',
      args: ['--noEmit'],
    })

    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      ['/project/node_modules/typescript/bin/tsc', '--noEmit'],
      expect.objectContaining({
        cwd: '/project',
        detached: process.platform !== 'win32',
        shell: false,
        stdio: 'inherit',
      })
    )
    getAddedListener('SIGTERM')()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')

    child.emit('close', 0, null)

    await expect(resultPromise).rejects.toThrow(
      'TypeScript CLI interrupted by SIGTERM'
    )
    expect(processKill).toHaveBeenCalledWith(process.pid, 'SIGTERM')
    expectListenersRestored()
  })

  it('rejects spawn failures and cleans up all listeners', async () => {
    const error = new Error('failed to spawn tsc')
    const resultPromise = runTypeScriptCli({
      cwd: '/project',
      tscPath: '/project/node_modules/typescript/bin/tsc',
      args: ['--noEmit'],
    })
    const rejection = resultPromise.catch((spawnError) => spawnError)

    child.emit('error', error)

    await expect(rejection).resolves.toBe(error)
    expectListenersRestored()
  })

  it('decodes captured UTF-8 output across chunk boundaries', async () => {
    const resultPromise = runTypeScriptCli({
      cwd: '/project',
      tscPath: '/project/node_modules/typescript/bin/tsc',
      args: ['--showConfig'],
      captureOutput: true,
    })
    const stdout = '{"compilerOptions":{"baseUrl":"café"}}'
    const stdoutBuffer = Buffer.from(stdout)
    const splitIndex = stdoutBuffer.indexOf('é') + 1

    child.stdout.write(stdoutBuffer.subarray(0, splitIndex))
    child.stdout.write(stdoutBuffer.subarray(splitIndex))
    child.stderr.write(Buffer.from('avertissement 💡'))
    child.emit('close', 0, null)

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 0,
      stdout,
      stderr: 'avertissement 💡',
    })
    expectListenersRestored()
  })
})
