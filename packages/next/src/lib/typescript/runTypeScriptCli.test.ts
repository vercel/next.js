import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { filterTypeScriptFiles } from './filterTypeScriptFiles'
import { runTypeCheckCli } from './runTypeCheckCli'
import * as typescriptCli from './runTypeScriptCli'

const mockSpawn = jest.fn()

jest.mock('./runTypeScriptCli', () => ({
  __esModule: true,
  ...jest.requireActual('./runTypeScriptCli'),
}))

jest.mock('next/dist/compiled/cross-spawn', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSpawn(...args),
}))

const { getTypeScriptPackageInfo, runTypeScriptCli } =
  require('./runTypeScriptCli') as typeof import('./runTypeScriptCli')

function createTypeScriptFixture({
  packageJson,
  files,
}: {
  packageJson: Record<string, unknown>
  files: string[]
}) {
  const baseDir = mkdtempSync(path.join(tmpdir(), 'next-typescript-'))
  const packageDir = path.join(baseDir, 'node_modules', 'typescript')

  mkdirSync(packageDir, { recursive: true })
  writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify(packageJson)
  )

  for (const file of files) {
    const filePath = path.join(packageDir, file)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, '')
  }

  return { baseDir, packageDir }
}

function removeTypeScriptFixture(baseDir: string) {
  rmSync(baseDir, { recursive: true, force: true })
}

describe('getTypeScriptPackageInfo', () => {
  it('resolves a standard tsc bin', () => {
    const { baseDir, packageDir } = createTypeScriptFixture({
      packageJson: {
        version: '6.0.1',
        bin: { tsc: './bin/tsc' },
      },
      files: ['bin/tsc', 'lib/typescript.js'],
    })

    try {
      expect(getTypeScriptPackageInfo(baseDir)).toMatchObject({
        apiPath: path.join(packageDir, 'lib', 'typescript.js'),
        tscPath: path.join(packageDir, 'bin', 'tsc'),
      })
    } finally {
      removeTypeScriptFixture(baseDir)
    }
  })

  it('resolves a versioned tsc bin from an aliased TypeScript package', () => {
    const { baseDir, packageDir } = createTypeScriptFixture({
      packageJson: {
        name: '@typescript/typescript6',
        version: '6.0.1',
        bin: { tsc6: './bin/tsc6' },
      },
      files: ['bin/tsc6', 'lib/typescript.js'],
    })

    try {
      expect(getTypeScriptPackageInfo(baseDir)).toMatchObject({
        apiPath: path.join(packageDir, 'lib', 'typescript.js'),
        tscPath: path.join(packageDir, 'bin', 'tsc6'),
      })
    } finally {
      removeTypeScriptFixture(baseDir)
    }
  })

  it('does not return a tsc path when the declared bin is missing', () => {
    const { baseDir } = createTypeScriptFixture({
      packageJson: {
        version: '6.0.1',
        bin: { tsc6: './bin/tsc6' },
      },
      files: ['lib/typescript.js'],
    })

    try {
      expect(getTypeScriptPackageInfo(baseDir)?.tscPath).toBeUndefined()
    } finally {
      removeTypeScriptFixture(baseDir)
    }
  })

  it('uses the JS CLI wrapper for an extensionless ESM bin', () => {
    const { baseDir, packageDir } = createTypeScriptFixture({
      packageJson: {
        version: '7.0.0',
        type: 'module',
        bin: { tsc: './bin/tsc' },
      },
      files: ['bin/tsc', 'lib/tsc.js'],
    })

    try {
      expect(getTypeScriptPackageInfo(baseDir)?.tscPath).toBe(
        path.join(packageDir, 'lib', 'tsc.js')
      )
    } finally {
      removeTypeScriptFixture(baseDir)
    }
  })
})

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

describe('filtered TypeScript CLI projects', () => {
  let baseDir: string
  let tsConfigPath: string
  let configSpy: jest.SpyInstance
  let runSpy: jest.SpyInstance
  let projectPath: string

  beforeEach(() => {
    baseDir = mkdtempSync(path.join(tmpdir(), 'next-typescript-filter-'))
    tsConfigPath = path.join(baseDir, 'config', 'tsconfig.build.json')
    mkdirSync(path.dirname(tsConfigPath))
    writeFileSync(tsConfigPath, '{ "extends": "./base.json" }')
    configSpy = jest
      .spyOn(typescriptCli, 'getTypeScriptConfigurationCli')
      .mockResolvedValue({
        compilerOptions: { incremental: true },
        files: [
          '../src/app/page.tsx',
          '../src/app/excluded/page.tsx',
          '../src/shared.ts',
        ],
        references: [{ path: './referenced' }],
      })
    runSpy = jest.spyOn(typescriptCli, 'runTypeScriptCli')
  })

  afterEach(() => {
    configSpy.mockRestore()
    runSpy.mockRestore()
    rmSync(baseDir, { recursive: true, force: true })
  })

  function check() {
    return runTypeCheckCli({
      baseDir,
      tsConfigPath,
      tscPath: 'tsc',
      cacheDir: path.join(baseDir, '.next/cache'),
      dirs: { app: path.join(baseDir, 'src/app') },
      debugBuildPaths: { app: [path.join(path.sep, 'page.tsx')] },
    })
  }

  it('uses selected roots and cleans up without modifying the original config', async () => {
    runSpy.mockImplementation(async ({ args }) => {
      projectPath = args[1]
      const config = JSON.parse(readFileSync(projectPath, 'utf8'))
      expect(path.dirname(projectPath)).toBe(path.dirname(tsConfigPath))
      expect(config.extends).toBe('./tsconfig.build.json')
      expect(config.files).toEqual([
        path.join(baseDir, 'src/app/page.tsx'),
        path.join(baseDir, 'src/shared.ts'),
      ])
      expect(config.include).toEqual([])
      expect(config.references).toEqual([{ path: './referenced' }])
      return { exitCode: 0, signal: null, stdout: '', stderr: '' }
    })
    await expect(check()).resolves.toEqual({ incremental: true })
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          '--tsBuildInfoFile',
          path.join(baseDir, '.next/cache/.tsbuildinfo'),
        ]),
      })
    )
    expect(existsSync(projectPath)).toBe(false)
    expect(readFileSync(tsConfigPath, 'utf8')).toBe(
      '{ "extends": "./base.json" }'
    )
  })

  it.each(['diagnostics', 'spawn failure'])(
    'cleans up after %s',
    async (failure) => {
      runSpy.mockImplementation(async ({ args }) => {
        projectPath = args[1]
        expect(existsSync(projectPath)).toBe(true)
        if (failure === 'spawn failure') throw new Error('spawn failed')
        return { exitCode: 1, signal: null, stdout: '', stderr: '' }
      })
      await expect(check()).rejects.toThrow()
      expect(existsSync(projectPath)).toBe(false)
      expect(readdirSync(path.dirname(tsConfigPath))).toEqual([
        'tsconfig.build.json',
      ])
    }
  )

  it('does not invoke tsc when all roots are excluded', async () => {
    configSpy.mockResolvedValue({
      compilerOptions: {},
      files: ['../src/app/excluded/page.tsx'],
    })
    await expect(check()).resolves.toEqual({ incremental: false })
    expect(runSpy).not.toHaveBeenCalled()
    expect(readdirSync(path.dirname(tsConfigPath))).toEqual([
      'tsconfig.build.json',
    ])
  })

  it('uses the original project for unfiltered builds', async () => {
    runSpy.mockResolvedValue({
      exitCode: 0,
      signal: null,
      stdout: '',
      stderr: '',
    })
    await runTypeCheckCli({ baseDir, tsConfigPath, tscPath: 'tsc' })
    expect(runSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['--project', tsConfigPath]),
      })
    )
    expect(readdirSync(path.dirname(tsConfigPath))).toEqual([
      'tsconfig.build.json',
    ])
  })

  it('distinguishes undefined and empty router selections and retains shared roots', () => {
    const app = path.join(baseDir, 'app')
    const pages = path.join(baseDir, 'pages')
    const roots = [
      path.join(app, 'page.tsx'),
      path.join(pages, 'index.tsx'),
      path.join(baseDir, 'app-other/shared.ts'),
    ]
    expect(filterTypeScriptFiles(roots, { app, pages }, { app: [] })).toEqual(
      roots.slice(1)
    )
    expect(filterTypeScriptFiles(roots, { app, pages }, { pages: [] })).toEqual(
      [roots[0], roots[2]]
    )
    expect(
      filterTypeScriptFiles(roots, { app, pages }, { app: [], pages: [] })
    ).toEqual([roots[2]])
  })
})
