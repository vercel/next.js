import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { runInNewContext } from 'node:vm'
const {
  Command,
  InvalidArgumentError,
  Option,
} = require('next/dist/compiled/commander')
import { ModuleKind, transpileModule } from 'typescript'
import watchReference from './reference.json'
import { createTestTypecheckCliArguments } from 'next/dist/experimental/testing/typecheck-cli'
import {
  normalizeTestConfig,
  openTestConfiguration,
  parseTestConfig,
} from 'next/dist/experimental/testing/config'
import { nextTestRunner } from 'next/dist/cli/next-test-runner'
import { runTests } from 'next/dist/experimental/testing/orchestrator'
import { watchTests } from 'next/dist/experimental/testing/watch-orchestrator'

jest.mock('next/dist/experimental/testing/config', () => ({
  ...jest.requireActual('next/dist/experimental/testing/config'),
  openTestConfiguration: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/scheduling', () => ({
  ...jest.requireActual('next/dist/experimental/testing/scheduling'),
  acquireTestRunLock: async () => ({ unlock: async () => {} }),
}))
jest.mock('next/dist/experimental/testing/orchestrator', () => ({
  runTests: jest.fn(async () => ({ status: 'passed', unsafeCleanup: false })),
}))
jest.mock('next/dist/experimental/testing/watch-orchestrator', () => ({
  watchTests: jest.fn(async () => ({ status: 'passed' })),
}))

it.each([false, true])(
  'retains authored root watch=%s without inheriting it into projects',
  (watch) => {
    const config = normalizeTestConfig({
      test: {
        watch,
        projects: [
          { test: { name: 'inherited' } },
          { extends: false, test: { name: 'independent' } },
        ],
      },
    })
    expect(config.watch).toBe(watch)
    expect(config.projects).toHaveLength(2)
    for (const project of config.projects)
      expect(project).not.toHaveProperty('watch')
    expect(parseTestConfig({ watch }).watch).toBe(watch)
  }
)

it('preserves an omitted root watch setting', () => {
  expect(normalizeTestConfig({ test: {} })).not.toHaveProperty('watch')
  expect(parseTestConfig({})).not.toHaveProperty('watch')
})

it.each([null, 'true', 1, {}, []])(
  'rejects malformed authored root watch: %j',
  (watch) => {
    expect(() => normalizeTestConfig({ test: { watch } })).toThrow(
      'config.watch must be a boolean'
    )
  }
)

const parserCases = watchReference.parser.rows as {
  flags: string[]
  actual?: { options: { watch?: boolean } }
  error?: { name: string; message: string }
}[]
it.each(parserCases)(
  'matches actual Commander parsing with the pinned watch options: $flags',
  async ({ flags, actual, error }) => {
    const source = await readFile(
      path.join(__dirname, '../../../packages/next/src/bin/next.ts'),
      'utf8'
    )
    const start = source.indexOf('const testTypecheckArguments =')
    const end = source.indexOf(
      '      const { nextTestRunner } = await import',
      start
    )
    const argv = source.indexOf('const argv = process.argv')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(argv).toBeGreaterThan(end)
    // Exercise the actual registered options, source-order observers, validation
    // and argv normalization. The execution action ends before loading a runner.
    const registration =
      source.slice(start, end) +
      'capture(options) } catch(error) { throw error } })'
    const normalization = source
      .slice(argv)
      .replaceAll('program.parse(', 'completion = program.parseAsync(')
    let options: { watch?: boolean } | undefined
    const context = {
      program: new Command().exitOverride(),
      Option,
      InvalidArgumentError,
      createTestTypecheckCliArguments,
      process: { argv: ['node', 'next', 'test', ...flags] },
      completion: undefined as Promise<unknown> | undefined,
      capture(value: { watch?: boolean }) {
        options = value
      },
    }
    runInNewContext(
      transpileModule(registration + '\n' + normalization, {
        compilerOptions: { module: ModuleKind.CommonJS },
      }).outputText,
      context
    )
    if (error) {
      await expect(context.completion).rejects.toMatchObject(error)
      expect(options).toBeUndefined()
    } else {
      await context.completion
      expect(options?.watch).toBe(actual?.options.watch)
    }
  }
)

describe('initial CLI session selection', () => {
  let directory: string
  let originalExitCode: typeof process.exitCode
  beforeEach(async () => {
    directory = await mkdtemp(
      path.join(tmpdir(), 'next-configured-watch-dispatch-')
    )
    originalExitCode = process.exitCode
    jest.clearAllMocks()
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })
  afterEach(async () => {
    process.exitCode = originalExitCode
    jest.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  it.each([
    { name: 'authored true', authored: true, options: {}, expected: true },
    { name: 'authored false', authored: false, options: {}, expected: false },
    {
      name: 'run overrides authored true',
      authored: true,
      options: { run: true },
      expected: false,
    },
    {
      name: 'CLI watch overrides authored false',
      authored: false,
      options: { watch: true },
      expected: true,
    },
    {
      name: 'CLI false overrides authored true',
      authored: true,
      options: { watch: false },
      expected: false,
    },
    {
      name: 'run wins both CLI flags',
      authored: true,
      options: { run: true, watch: true },
      expected: false,
    },
  ])('$name', async ({ authored, options, expected }) => {
    const dispose = jest.fn(async () => {})
    jest.mocked(openTestConfiguration).mockResolvedValue({
      config: normalizeTestConfig({
        test: { watch: authored, passWithNoTests: true },
      }),
      compilerInputsForProjects: () => [],
      compilerTransforms: {},
      compilerTransformNames: [],
      watchInputs: [],
      setup: async () => {},
      dispose,
    } as unknown as Awaited<ReturnType<typeof openTestConfiguration>>)
    await nextTestRunner(directory, options)
    expect(watchTests).toHaveBeenCalledTimes(expected ? 1 : 0)
    expect(runTests).toHaveBeenCalledTimes(expected ? 0 : 1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it.each([
    { authored: false, automatic: true, expected: false },
    { authored: undefined, automatic: true, expected: true },
    { authored: true, automatic: false, expected: true },
    { authored: undefined, automatic: false, expected: false },
  ])(
    'applies root $authored before the automatic $automatic default',
    async ({ authored, automatic, expected }) => {
      jest.doMock('next/dist/experimental/testing/config-api', () => {
        const actual = jest.requireActual(
          'next/dist/experimental/testing/config-api'
        )
        return {
          ...actual,
          configDefaults: { ...actual.configDefaults, watch: automatic },
        }
      })
      try {
        await jest.isolateModulesAsync(async () => {
          const config = await import('next/dist/experimental/testing/config')
          const watch = await import(
            'next/dist/experimental/testing/watch-orchestrator'
          )
          const run = await import(
            'next/dist/experimental/testing/orchestrator'
          )
          jest.mocked(config.openTestConfiguration).mockResolvedValue({
            config: config.normalizeTestConfig({
              test: { watch: authored, passWithNoTests: true },
            }),
            compilerInputsForProjects: () => [],
            compilerTransforms: {},
            compilerTransformNames: [],
            watchInputs: [],
            setup: async () => {},
            dispose: async () => {},
          } as unknown as Awaited<ReturnType<typeof openTestConfiguration>>)
          const { nextTestRunner: runner } = await import(
            'next/dist/cli/next-test-runner'
          )
          await runner(directory, {})
          expect(watch.watchTests).toHaveBeenCalledTimes(expected ? 1 : 0)
          expect(run.runTests).toHaveBeenCalledTimes(expected ? 0 : 1)
        })
      } finally {
        jest.dontMock('next/dist/experimental/testing/config-api')
      }
    }
  )

  it('retains one-shot listing when authored watch is true', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.mocked(openTestConfiguration).mockResolvedValue({
      config: normalizeTestConfig({
        test: { watch: true, passWithNoTests: true },
      }),
      compilerInputsForProjects: () => [],
      compilerTransformNames: [],
      watchInputs: [],
      dispose: async () => {},
    } as unknown as Awaited<ReturnType<typeof openTestConfiguration>>)
    await nextTestRunner(directory, { list: true })
    expect(watchTests).not.toHaveBeenCalled()
    expect(runTests).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('0 test file(s) selected.')
  })
})

it('executes real config-selected watch and one-shot sessions and joins their owned processes', async () => {
  const temporary = await mkdtemp(
    path.join(tmpdir(), 'next-configured-watch-public-')
  )
  let completed = false
  try {
    const evidence = path.join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        path.join(__dirname, 'verify.mjs'),
        path.join(__dirname, '../../..'),
        evidence,
      ],
      { timeout: 840000, maxBuffer: 1024 * 1024 }
    )
    const verified = JSON.parse(
      await readFile(path.join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(verified).toMatchObject({
      profiles: 8,
      actualPassedCases: 8,
      allRealInitialReportsPassed: true,
      allOwnedProcessesJoined: true,
      allAuthoredInputsHeld: true,
      allFixturesRemoved: true,
    })
    completed = true
  } catch (error) {
    throw new Error(`Configured watch evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (completed) await rm(temporary, { recursive: true, force: true })
  }
}, 860000)
