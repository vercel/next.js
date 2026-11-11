import { execFile } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { runInNewContext } from 'node:vm'
import { ModuleKind, transpileModule } from 'typescript'
import inspectorReference from './reference.json'
import {
  normalizeTestConfig,
  openTestConfiguration,
  parseTestConfig,
} from 'next/dist/experimental/testing/config'
import {
  parseConfiguredTestInspectAddress,
  parseTestInspectAddress,
} from 'next/dist/experimental/testing/execution/inspector'
import { nextTestRunner } from 'next/dist/cli/next-test-runner'
import { runTests } from 'next/dist/experimental/testing/orchestrator'
import { watchTests } from 'next/dist/experimental/testing/watch-orchestrator'
const { Command, Option } = require('next/dist/compiled/commander')

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

it.each([false, true, 'localhost', '127.0.0.1:9238'])(
  'retains root inspect=%s without inheriting it into projects',
  (inspect) => {
    const config = normalizeTestConfig({
      test: {
        inspect,
        projects: [
          { test: { name: 'inherited' } },
          { extends: false, test: { name: 'independent' } },
        ],
      },
    })
    expect(config.inspect).toBe(inspect)
    expect(config.projects).toHaveLength(2)
    for (const project of config.projects)
      expect(project).not.toHaveProperty('inspect')
    expect(parseTestConfig({ inspect }).inspect).toBe(inspect)
  }
)

it('preserves an omitted root inspect setting', () => {
  expect(normalizeTestConfig({ test: {} })).not.toHaveProperty('inspect')
  expect(parseTestConfig({})).not.toHaveProperty('inspect')
})

it.each([null, 1, {}, []])(
  'rejects malformed authored root inspection: %j',
  (inspect) => {
    expect(() => normalizeTestConfig({ test: { inspect } })).toThrow(
      'config.inspect must be a boolean or string'
    )
  }
)

it.each([
  [undefined, undefined],
  [false, undefined],
  ['', undefined],
  [true, '127.0.0.1:9229'],
  ['127.0.0.1:9238', '127.0.0.1:9238'],
  ['127.0.0.1:0', '127.0.0.1:9229'],
  ['localhost', 'localhost:9229'],
  ['9238', '9238:9229'],
] as const)(
  'resolves the configured host shape %s as %s',
  (input, expected) => {
    expect(parseConfiguredTestInspectAddress(input)).toBe(expected)
  }
)

it('retains the existing distinct CLI ephemeral-port meaning', () => {
  expect(parseTestInspectAddress('0')).toBe('127.0.0.1:0')
  expect(parseConfiguredTestInspectAddress('127.0.0.1:0')).toBe(
    '127.0.0.1:9229'
  )
})

it('preserves the genuine configured URL refusal', () => {
  const row = inspectorReference.resolution.find(
    (entry) => entry.name === 'root-url-refused'
  )!
  expect(() =>
    parseConfiguredTestInspectAddress('http://localhost:9238')
  ).toThrow(row.error!.message)
})

it.each([
  { flags: [], expected: undefined },
  { flags: ['--inspect'], expected: true },
  { flags: ['--inspect=true'], expected: 'true' },
  { flags: ['--inspect=false'], expected: 'false' },
  { flags: ['--inspect=yes'], expected: 'yes' },
  { flags: ['--inspect=no'], expected: 'no' },
  { flags: ['--no-inspect'], expected: false },
  { flags: ['--inspect=127.0.0.1:9238'], expected: '127.0.0.1:9238' },
])('uses the actual registered inspector CLI options: $flags', async (plan) => {
  const source = await readFile(
    path.join(__dirname, '../../../../packages/next/src/bin/next.ts'),
    'utf8'
  )
  const start = source.indexOf("  .option(\n    '--inspect [address]'")
  const end = source.indexOf("  .option('--file-parallelism'", start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const registration = 'program' + source.slice(start, end)
  const compiled = transpileModule(registration, {
    compilerOptions: { module: ModuleKind.CommonJS },
  }).outputText
  const program = new Command().exitOverride()
  runInNewContext(compiled, { program, Option })
  program.parse(plan.flags, { from: 'user' })
  expect(program.opts().inspect).toBe(plan.expected)
})

describe('configured worker inspector dispatch', () => {
  let directory: string
  let originalExitCode: typeof process.exitCode
  let dispose: jest.Mock

  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'next-config-inspect-unit-'))
    )
    originalExitCode = process.exitCode
    jest.clearAllMocks()
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    dispose = jest.fn(async () => {})
  })
  afterEach(async () => {
    process.exitCode = originalExitCode
    jest.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  function configure(
    inspect: boolean | string | undefined,
    settings: Record<string, unknown> = {}
  ) {
    jest.mocked(openTestConfiguration).mockResolvedValue({
      config: normalizeTestConfig({
        test: { inspect, ...settings, passWithNoTests: true },
      }),
      compilerInputsForProjects: () => [],
      compilerTransforms: {},
      compilerTransformNames: [],
      watchInputs: [],
      setup: async () => {},
      dispose,
    } as unknown as Awaited<ReturnType<typeof openTestConfiguration>>)
  }

  it.each([
    { authored: true, options: {}, expected: '127.0.0.1:9229' },
    { authored: false, options: {}, expected: undefined },
    { authored: '127.0.0.1:9238', options: {}, expected: '127.0.0.1:9238' },
    { authored: true, options: { inspect: false }, expected: undefined },
    { authored: true, options: { inspect: 'false' }, expected: undefined },
    {
      authored: false,
      options: { inspect: '127.0.0.1:9239' },
      expected: '127.0.0.1:9239',
    },
    {
      authored: 'http://localhost:9238',
      options: { inspect: false },
      expected: undefined,
    },
  ])(
    'passes the effective $expected to actual execution planning',
    async (plan) => {
      configure(plan.authored)
      await nextTestRunner(directory, { run: true, ...plan.options })
      expect(runTests).toHaveBeenCalledTimes(1)
      expect(runTests).toHaveBeenCalledWith(
        directory,
        expect.any(Array),
        expect.objectContaining({ inspect: plan.expected })
      )
      expect(watchTests).not.toHaveBeenCalled()
      expect(dispose).toHaveBeenCalledTimes(1)
    }
  )

  it.each([{ list: true }, { watch: true }, { coverage: true }])(
    'retains one-shot inspection restrictions for %j',
    async (options) => {
      configure(true)
      await expect(nextTestRunner(directory, options)).rejects.toThrow(
        'one-shot execution without coverage'
      )
      expect(runTests).not.toHaveBeenCalled()
      expect(watchTests).not.toHaveBeenCalled()
      expect(dispose).toHaveBeenCalledTimes(1)
    }
  )

  it.each([
    {
      name: 'multiple projects',
      settings: { projects: [{ name: 'first' }, { name: 'second' }] },
    },
    { name: 'Browser execution', settings: { environment: 'browser' } },
    { name: 'RSC execution', settings: { environment: 'rsc', route: '/' } },
    { name: 'shared workers', settings: { isolate: false } },
    { name: 'custom environments', settings: { environment: 'jsdom' } },
    { name: 'routes', settings: { route: '/page' } },
  ])(
    'refuses unqualified configured inspection for $name',
    async ({ settings }) => {
      configure(true, settings)
      await expect(nextTestRunner(directory, { run: true })).rejects.toThrow(
        'Configured inspect currently requires one isolated ordinary Node project'
      )
      expect(runTests).not.toHaveBeenCalled()
      expect(watchTests).not.toHaveBeenCalled()
      expect(dispose).toHaveBeenCalledTimes(1)
    }
  )

  it('retains the configured role for actual per-file environment directives', async () => {
    configure(true)
    await writeFile(
      path.join(directory, 'environment.test.mjs'),
      '/** @vitest-environment jsdom */\nthrow new Error("unstarted environment body")\n'
    )
    await expect(nextTestRunner(directory, { run: true })).rejects.toThrow(
      'Configured inspect currently requires one isolated ordinary Node project'
    )
    expect(runTests).not.toHaveBeenCalled()
    expect(watchTests).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('retains serial worker restrictions', async () => {
    configure(true)
    await expect(
      nextTestRunner(directory, { run: true, maxWorkers: '2' })
    ).rejects.toThrow('--no-file-parallelism or --max-workers=1')
    expect(runTests).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('refuses an inline child inspector rather than dropping it', () => {
    expect(() =>
      normalizeTestConfig({
        test: { projects: [{ test: { inspect: false } }] },
      })
    ).toThrow('inspect')
  })

  it('refuses a file-project inspector rather than dropping it', async () => {
    const actual = jest.requireActual<
      typeof import('next/dist/experimental/testing/config')
    >('next/dist/experimental/testing/config')
    await writeFile(
      path.join(directory, 'vitest.config.mjs'),
      `export default { test: { projects: ['./vitest.child.config.mjs'] } }\n`
    )
    await writeFile(
      path.join(directory, 'vitest.child.config.mjs'),
      `export default { test: { name: 'child', inspect: false } }\n`
    )
    await expect(actual.openTestConfiguration(directory)).rejects.toThrow(
      'cannot select inspection yet'
    )
  })
})

it('executes root-configured inspection and explicit CLI overrides through the public command', async () => {
  const temporary = await mkdtemp(
    path.join(tmpdir(), 'next-config-inspect-public-')
  )
  let completed = false
  try {
    const evidence = path.join(temporary, 'evidence')
    const consumerRoot =
      process.env.NEXT_TEST_CONFIGURED_INSPECT_CONSUMER_ROOT ??
      path.join(__dirname, '../../../..')
    await promisify(execFile)(
      process.execPath,
      [path.join(__dirname, 'verify.mjs'), consumerRoot, evidence],
      { timeout: 840000, maxBuffer: 1024 * 1024 }
    )
    const verified = JSON.parse(
      await readFile(path.join(evidence, 'QUALIFIED.json'), 'utf8')
    )
    expect(verified).toMatchObject({
      profiles: 28,
      actualPassedCases: 24,
      actualRefusals: 4,
      allReportsMatch: true,
      allOwnedProcessesJoined: true,
      allAuthoredBodiesHeld: true,
      allFixturesRemoved: true,
    })
    completed = true
  } catch (error) {
    throw new Error(`Configured inspector evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (completed) await rm(temporary, { recursive: true, force: true })
  }
}, 860000)
