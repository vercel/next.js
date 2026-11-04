import {
  copyFile,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  applyTestConfigOverrides,
  normalizeTestConfig,
} from 'next/dist/experimental/testing/config'
import { discoverTests } from 'next/dist/experimental/testing/discovery'
import { runTypecheckProject } from 'next/dist/experimental/testing/typecheck'
import type { TestProcessOptions } from 'next/dist/experimental/testing/execution/process'
import {
  loadActualTestRunner,
  parseActualTestCommand,
} from './actual-bin-command'

const mockRunTests = jest.fn()
const mockDiscoverTests = jest.fn()
const mockRunTestProcess = jest.fn()
const mockCompiler = jest.fn()
const mockRunLockUnlock = jest.fn(async () => {})
const mockAcquireTestRunLock = jest.fn(
  async (_directory: string, _options?: { recoverSnapshots?: boolean }) => ({
    unlock: mockRunLockUnlock,
  })
)

jest.mock('next/dist/experimental/testing/orchestrator', () => ({
  runTests: (...args: unknown[]) => mockRunTests(...args),
}))

jest.mock('next/dist/experimental/testing/discovery', () => ({
  ...jest.requireActual('next/dist/experimental/testing/discovery'),
  discoverTests: (...args: unknown[]) => mockDiscoverTests(...args),
}))

jest.mock('next/dist/experimental/testing/execution/process', () => ({
  runTestProcess: (...args: unknown[]) => mockRunTestProcess(...args),
}))

jest.mock('next/dist/experimental/testing/compiler', () => ({
  createTestCompilerSession: (...args: unknown[]) => mockCompiler(...args),
}))

// This CLI option component stops before execution; native run-lock startup is
// an owned external boundary, while all scheduling/planning exports stay real.
jest.mock('next/dist/experimental/testing/scheduling', () => ({
  ...jest.requireActual('next/dist/experimental/testing/scheduling'),
  acquireTestRunLock: (
    ...args: Parameters<
      typeof import('next/dist/experimental/testing/scheduling').acquireTestRunLock
    >
  ) => mockAcquireTestRunLock(...args),
}))

const executionStop = new Error('component execution seam')
const processStop = new Error('component typecheck process seam')
const nextTestRunner = loadActualTestRunner()

describe('actual CLI options reach configured typecheck projects', () => {
  let directory: string
  let exitCode: typeof process.exitCode

  beforeEach(async () => {
    exitCode = process.exitCode
    directory = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'next-typecheck-cli-'))
    )
    await Promise.all([
      copyFile(
        path.join(__dirname, 'fixtures/example.test-d.ts.txt'),
        path.join(directory, 'example.test-d.ts')
      ),
      copyFile(
        path.join(__dirname, 'fixtures/runtime.test.mjs.txt'),
        path.join(directory, 'runtime.test.mjs')
      ),
      copyFile(
        path.join(__dirname, 'fixtures/tsconfig.json'),
        path.join(directory, 'tsconfig.json')
      ),
      writeFile(path.join(directory, 'package.json'), '{"private":true}\n'),
    ])
    mockRunTests.mockReset().mockRejectedValue(executionStop)
    mockRunLockUnlock.mockReset().mockResolvedValue(undefined)
    mockAcquireTestRunLock
      .mockReset()
      .mockResolvedValue({ unlock: mockRunLockUnlock })
    mockRunTestProcess.mockReset().mockImplementation(() => {
      throw processStop
    })
    mockCompiler.mockReset().mockImplementation(() => {
      throw new Error('The compiler must stay behind the execution seam')
    })
    mockDiscoverTests
      .mockReset()
      .mockImplementation(
        jest.requireActual('next/dist/experimental/testing/discovery')
          .discoverTests
      )
  })

  afterEach(async () => {
    try {
      await rm(directory, { recursive: true, force: true })
    } finally {
      process.exitCode = exitCode
    }
  })

  async function reachExecution(
    argv: readonly string[],
    authored: { enabled?: boolean; only?: boolean; spawnTimeout?: number } = {}
  ) {
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({
        test: {
          watch: false,
          mode: 'development',
          include: ['**/*.test.mjs'],
          testTimeout: 71,
          hookTimeout: 72,
          fileTimeout: 150,
          typecheck: {
            enabled: true,
            only: false,
            spawnTimeout: 99,
            tsconfig: './tsconfig.json',
            include: ['**/*.test-d.ts'],
            exclude: ['**/excluded/**'],
            ...authored,
          },
        },
      })
    )
    const command = await parseActualTestCommand(argv)
    expect(command.parserError).toBeUndefined()
    expect(command.exitCode).toBeUndefined()
    expect(command.nextTestRunner).toHaveBeenCalledTimes(1)
    const options = command.nextTestRunner.mock.calls[0][1]
    await expect(
      nextTestRunner(directory, { ...options, reporter: ['json'] })
    ).rejects.toBe(executionStop)
    expect(mockRunTests).toHaveBeenCalledTimes(1)
    expect(mockAcquireTestRunLock).toHaveBeenCalledTimes(1)
    expect(mockAcquireTestRunLock).toHaveBeenCalledWith(directory)
    expect(mockRunLockUnlock).toHaveBeenCalledTimes(1)
    expect(mockCompiler).not.toHaveBeenCalled()
    expect(mockRunTestProcess).not.toHaveBeenCalled()
    const discoveryCall = mockDiscoverTests.mock.calls[0] as Parameters<
      typeof discoverTests
    >
    const projects = mockRunTests.mock.calls[0][1] as Awaited<
      ReturnType<typeof discoverTests>
    >
    return { config: discoveryCall[1], projects }
  }

  it.each([
    ['--typecheck.spawnTimeout=0', 0],
    ['--no-typecheck.spawnTimeout', false],
    ['--typecheck.spawnTimeout=false', 'false'],
    ['--typecheck.spawnTimeout=NaN', 'NaN'],
  ] as const)(
    'forwards the raw %s leaf without replacing configured options',
    async (argument, expected) => {
      const { config, projects } = await reachExecution([argument])
      expect(config.projects[0].typecheck).toEqual({
        enabled: true,
        only: false,
        spawnTimeout: expected,
        tsconfig: './tsconfig.json',
        include: ['**/*.test-d.ts'],
        exclude: ['**/excluded/**'],
        allowJs: false,
        ignoreSourceErrors: false,
      })
      expect(projects[0].entries.map((entry) => entry.id)).toEqual([
        'default:runtime.test.mjs',
        'default:typescript:example.test-d.ts',
      ])
    }
  )

  it('keeps a disabled project disabled when only the leaf is supplied', async () => {
    const { config, projects } = await reachExecution(
      ['--typecheck.spawnTimeout=0'],
      { enabled: false }
    )
    expect(config.projects[0].typecheck).toMatchObject({
      enabled: false,
      only: false,
      spawnTimeout: 0,
    })
    expect(projects[0].entries.map((entry) => entry.file)).toEqual([
      path.join(directory, 'runtime.test.mjs'),
    ])
    expect(projects[0].entries.every((entry) => !entry.typecheck)).toBe(true)
  })

  it('enables an authored disabled checker through the explicit parent flag', async () => {
    const { config, projects } = await reachExecution(['--typecheck'], {
      enabled: false,
      only: false,
    })
    expect(config.projects[0].typecheck).toMatchObject({
      enabled: true,
      only: false,
      spawnTimeout: 99,
    })
    expect(projects[0].entries.some((entry) => entry.typecheck)).toBe(true)
    expect(projects[0].entries.some((entry) => !entry.typecheck)).toBe(true)
  })

  it('enables only type entries through the explicit only flag', async () => {
    const { config, projects } = await reachExecution(['--typecheck.only'], {
      enabled: false,
      only: false,
    })
    expect(config.projects[0].typecheck).toMatchObject({
      enabled: true,
      only: true,
      spawnTimeout: 99,
    })
    expect(projects[0].entries.map((entry) => entry.id)).toEqual([
      'default:typescript:example.test-d.ts',
    ])
  })

  it.each([
    ['enable', '--typecheck', true],
    ['disable', '--no-typecheck', false],
  ] as const)(
    'inherits authored99 when a later parent requests %s',
    async (_name, parent, enabled) => {
      const { config } = await reachExecution([
        '--typecheck.spawnTimeout=1',
        parent,
      ])
      expect(config.projects[0].typecheck).toMatchObject({
        enabled,
        spawnTimeout: 99,
      })
    }
  )

  it('keeps only:false as an explicit boolean that enables an otherwise unselected checker', async () => {
    const { config, projects } = await reachExecution(
      ['--no-typecheck.only', '--typecheck.spawnTimeout=1'],
      { enabled: false, only: true }
    )
    expect(config.projects[0].typecheck).toMatchObject({
      enabled: true,
      only: false,
      spawnTimeout: 1,
    })
    expect(projects[0].entries.some((entry) => entry.typecheck)).toBe(true)
    expect(projects[0].entries.some((entry) => !entry.typecheck)).toBe(true)
  })

  it.each(['--typecheck.only', '--no-typecheck.only'])(
    'preserves explicit disabled enablement with %s',
    async (only) => {
      const { config, projects } = await reachExecution([
        '--no-typecheck',
        only,
        '--typecheck.spawnTimeout=1',
      ])
      expect(config.projects[0].typecheck?.enabled).toBe(false)
      expect(projects[0].entries.every((entry) => !entry.typecheck)).toBe(true)
    }
  )

  it('passes the quoted string leaf to the real typecheck process adapter', async () => {
    const { projects } = await reachExecution([
      '--typecheck.spawnTimeout',
      '"1"',
    ])
    await expect(
      runTypecheckProject(directory, projects[0], {
        signal: new AbortController().signal,
      })
    ).rejects.toBe(processStop)
    expect(mockRunTestProcess).toHaveBeenCalledTimes(1)
    const [worker, options] = mockRunTestProcess.mock.calls[0] as [
      string,
      TestProcessOptions,
    ]
    expect(worker).toMatch(/typecheck-worker/)
    expect(options.startup?.timeoutMs).toBe('1')
    expect(options.timeoutMs).toBe(150)
    expect(options.input).toMatchObject({ project: projects[0] })
    expect(mockCompiler).not.toHaveBeenCalled()
  })

  it('keeps the complete authored source bytes through component planning', async () => {
    const before = await readFile(path.join(directory, 'example.test-d.ts'))
    await reachExecution(['--typecheck.spawnTimeout=0'])
    expect(await readFile(path.join(directory, 'example.test-d.ts'))).toEqual(
      before
    )
  })
})

describe('CLI leaf overrides preserve current project ownership data', () => {
  it('retains independent enablement, resolved budgets, profiles and backend objects', () => {
    const config = normalizeTestConfig({
      test: {
        snapshotFormat: { printBasicPrototype: false },
        projects: [
          {
            test: {
              name: 'node',
              isolate: false,
              typecheck: { enabled: true, spawnTimeout: 99 },
            },
          },
          {
            test: {
              name: 'browser',
              browser: {
                enabled: true,
                instances: [{ browser: 'chromium' }],
                locators: { errorFormat: 'aria' },
              },
            },
          },
        ],
      },
    })
    const getter = jest.fn(() => {
      throw new Error('Backend getter must not be consumed by CLI override')
    })
    const backend = { owned: { value: 'preserved' } }
    const clock = Object.defineProperty({}, 'now', {
      enumerable: true,
      get: getter,
    })
    for (const project of config.projects) {
      project.provide = backend
      project.fakeTimers = clock
    }
    const budgets = config.projects.map((project) => [
      project.testTimeout,
      project.hookTimeout,
      project.fileTimeout,
    ])
    const result = applyTestConfigOverrides(config, {
      typecheck: { spawnTimeout: 0 },
    })
    expect(getter).not.toHaveBeenCalled()
    expect(result.snapshotFormat).toBe(config.snapshotFormat)
    expect(
      result.projects.map((project) => [
        project.testTimeout,
        project.hookTimeout,
        project.fileTimeout,
      ])
    ).toEqual(budgets)
    for (let index = 0; index < result.projects.length; index++) {
      expect(result.projects[index].profile).toBe(
        config.projects[index].profile
      )
      expect(result.projects[index].provide).toBe(backend)
      expect(result.projects[index].fakeTimers).toBe(clock)
      expect(result.projects[index].browserLocatorErrorFormat).toBe(
        config.projects[index].browserLocatorErrorFormat
      )
    }
    expect(result.projects[0].isolate).toBe(false)
    expect(result.projects[0].typecheck?.enabled).toBe(true)
    expect(result.projects[1].typecheck?.enabled).toBe(false)
  })

  it('retains the existing owned file budget clamp for unrelated timeout overrides', () => {
    const config = normalizeTestConfig({
      test: { testTimeout: 71, hookTimeout: 72, fileTimeout: 150 },
    })
    const result = applyTestConfigOverrides(config, {
      testTimeout: 200,
      hookTimeout: 250,
      typecheck: { spawnTimeout: 0 },
    })
    expect(result.projects[0]).toMatchObject({
      testTimeout: 200,
      hookTimeout: 250,
      fileTimeout: 250,
    })
    expect(config.projects[0]).toMatchObject({
      testTimeout: 71,
      hookTimeout: 72,
      fileTimeout: 150,
    })
  })

  it.each([false, true])(
    'keeps authored undefined presence=%s when no CLI leaf exists',
    (own) => {
      const config = normalizeTestConfig({
        test: {
          typecheck: {
            enabled: true,
            ...(own ? { spawnTimeout: undefined } : {}),
          },
        },
      })
      const result = applyTestConfigOverrides(config, {})
      expect(Object.hasOwn(result.projects[0].typecheck!, 'spawnTimeout')).toBe(
        own
      )
      expect(result.projects[0].typecheck).toBe(config.projects[0].typecheck)
    }
  )
})
