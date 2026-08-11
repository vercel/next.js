import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mockSpawn = jest.fn()

jest.mock('next/dist/compiled/cross-spawn', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSpawn(...args),
}))

const { runTypeScriptCli, getTypeScriptPackageInfo } =
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

  it('spawns tsc detached with piped stdio and resolves with the exit code', async () => {
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
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    )

    child.emit('close', 0, null)

    await expect(resultPromise).resolves.toMatchObject({
      exitCode: 0,
      signal: null,
    })
    expectListenersRestored()
  })

  it('forwards output as it arrives, preserving stdout/stderr interleaving, and stops the spinner on the first byte', async () => {
    const stdoutWrite = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true)
    const stderrWrite = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const onFirstOutput = jest.fn()

    try {
      const resultPromise = runTypeScriptCli({
        cwd: '/project',
        tscPath: '/project/node_modules/typescript/bin/tsc',
        args: ['--noEmit'],
        onFirstOutput,
      })

      child.stdout.write('checking a\n')
      child.stderr.write('warning b\n')
      child.stdout.write('checking c\n')
      child.emit('close', 0, null)

      await expect(resultPromise).resolves.toMatchObject({ exitCode: 0 })

      expect(onFirstOutput).toHaveBeenCalledTimes(1)
      expect(stdoutWrite).toHaveBeenNthCalledWith(1, 'checking a\n')
      expect(stderrWrite).toHaveBeenNthCalledWith(1, 'warning b\n')
      expect(stdoutWrite).toHaveBeenNthCalledWith(2, 'checking c\n')
    } finally {
      stdoutWrite.mockRestore()
      stderrWrite.mockRestore()
    }
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

describe('getTypeScriptPackageInfo', () => {
  let fixtureDir: string

  beforeEach(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-package-info-'))
    const pkgDir = path.join(fixtureDir, 'node_modules', 'typescript')
    fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true })
    fs.mkdirSync(path.join(pkgDir, 'lib'), { recursive: true })

    // `typescript` aliased to `@typescript/typescript6` — the package the
    // TypeScript team recommends for adopting the native compiler
    // incrementally. Its CLI ships as `tsc6` (not `tsc`) so it can coexist
    // with the native compiler's bin.
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@typescript/typescript6',
        version: '6.0.2',
        main: './lib/typescript.js',
        bin: { tsc6: './bin/tsc6' },
      })
    )
    fs.writeFileSync(
      path.join(pkgDir, 'bin', 'tsc6'),
      "#!/usr/bin/env node\nrequire('../lib/tsc.js')\n"
    )
    fs.writeFileSync(path.join(pkgDir, 'lib', 'tsc.js'), '// tsc entry\n')
    fs.writeFileSync(path.join(pkgDir, 'lib', 'typescript.js'), '// api\n')
  })

  afterEach(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  })

  it('detects a CLI entry when `typescript` is aliased to a fork whose bin is not named `tsc`', () => {
    const info = getTypeScriptPackageInfo(fixtureDir)

    // Regression test for https://github.com/vercel/next.js/issues/97015.
    // With the default `experimental.useTypeScriptCli`, Next runs
    // `tsc --showConfig` to load tsconfig `paths` under `next build --webpack`.
    // A `typescript` alias that only ships a `tsc6` bin must still be detected;
    // otherwise `useTypeScript` resolves to false, the tsconfig `paths` are
    // never loaded, and webpack fails to resolve every path alias.
    expect(info).not.toBeNull()
    expect(info!.version).toBe('6.0.2')
    expect(info!.tscPath).toBeTruthy()
    expect(path.basename(info!.tscPath!)).toBe('tsc.js')
    expect(fs.existsSync(info!.tscPath!)).toBe(true)
  })
})
