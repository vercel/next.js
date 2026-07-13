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
  pid = 4321
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

  it('spawns tsc detached with inherited stdio and resolves with the exit code', async () => {
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

    child.emit('close', 0, null)

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 0,
      signal: null,
    })
    expectListenersRestored()
  })

  it('SIGKILLs the whole process group on process exit', async () => {
    // The native compiler ignores catchable signals, so teardown must SIGKILL
    // the process group (negative pid) to reap it.
    if (process.platform === 'win32') {
      return
    }

    const resultPromise = runTypeScriptCli({
      cwd: '/project',
      tscPath: '/project/node_modules/typescript/bin/tsc',
      args: ['--noEmit'],
    })

    getAddedListener('exit')()
    expect(processKill).toHaveBeenCalledWith(-child.pid, 'SIGKILL')

    child.emit('close', null, 'SIGKILL')

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 1,
      signal: 'SIGKILL',
    })
    expectListenersRestored()
  })

  it('terminates the child only once', async () => {
    if (process.platform === 'win32') {
      return
    }

    const resultPromise = runTypeScriptCli({
      cwd: '/project',
      tscPath: '/project/node_modules/typescript/bin/tsc',
      args: ['--noEmit'],
    })

    const terminate = getAddedListener('exit')
    terminate()
    terminate()

    expect(processKill).toHaveBeenCalledTimes(1)

    child.emit('close', null, 'SIGKILL')
    await resultPromise
    expectListenersRestored()
  })

  it('reaps the child and exits on a termination signal', async () => {
    // Node.js does not fire `exit` on signal termination, so SIGINT/SIGTERM/
    // SIGHUP must be handled explicitly or the native compiler would be left
    // running.
    if (process.platform === 'win32') {
      return
    }

    const processExit = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)

    try {
      const resultPromise = runTypeScriptCli({
        cwd: '/project',
        tscPath: '/project/node_modules/typescript/bin/tsc',
        args: ['--noEmit'],
      })

      getAddedListener('SIGINT')()
      expect(processKill).toHaveBeenCalledWith(-child.pid, 'SIGKILL')
      expect(processExit).toHaveBeenCalledWith(1)

      child.emit('close', null, 'SIGKILL')
      await resultPromise
    } finally {
      processExit.mockRestore()
    }
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
