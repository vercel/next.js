import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  parseTestConfig,
  loadTestConfig,
} from 'next/dist/experimental/testing/config'
import { discoverTests } from 'next/dist/experimental/testing/discovery'
import { nextTestRunner } from 'next/dist/cli/next-test-runner'
import * as capabilities from 'next/dist/experimental/testing/capabilities'
import { remapCoverage } from 'next/dist/experimental/testing/coverage/remap'
import { runTests } from 'next/dist/experimental/testing/orchestrator'
import { watchTests } from 'next/dist/experimental/testing/watch-orchestrator'
import { watchTestFiles } from 'next/dist/experimental/testing/incremental/watch-files'
import {
  runWatchProcess,
  WatchOwnershipError,
} from 'next/dist/experimental/testing/watch-process'
import { createTestCompilerSession } from 'next/dist/experimental/testing/compiler'
import { execute } from 'next/dist/experimental/testing/execution/execute'
import {
  createApplicationServer,
  ApplicationServerError,
} from 'next/dist/experimental/testing/browser/server'
import { createBrowserHost } from 'next/dist/experimental/testing/browser/host'
import type { CompiledTestArtifact } from 'next/dist/experimental/testing/contracts'
import type { DiscoveredTestProject } from 'next/dist/experimental/testing/discovery'
import type { ResultEvent } from 'next/dist/experimental/testing/reporting/events'

jest.mock('next/dist/experimental/testing/capabilities', () => ({
  ...jest.requireActual('next/dist/experimental/testing/capabilities'),
  requireTestCapability: jest.fn(
    jest.requireActual('next/dist/experimental/testing/capabilities')
      .requireTestCapability
  ),
}))

jest.mock('next/dist/experimental/testing/coverage/remap', () => ({
  remapCoverage: jest.fn(),
}))

jest.mock('next/dist/experimental/testing/compiler', () => ({
  createTestCompilerSession: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/execution/execute', () => ({
  execute: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/incremental/watch-files', () => ({
  watchTestFiles: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/watch-process', () => ({
  ...jest.requireActual('next/dist/experimental/testing/watch-process'),
  runWatchProcess: jest.fn(),
}))

// Emitted .js imports and extensionless paths resolve to the same mocked files.
jest.mock('next/dist/experimental/testing/browser/server', () => ({
  ...jest.requireActual('next/dist/experimental/testing/browser/server'),
  createApplicationServer: jest.fn(),
}))
jest.mock('next/dist/experimental/testing/browser/host', () => ({
  createBrowserHost: jest.fn(),
}))

describe('Next-owned test discovery and configuration', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'next-testing-cli-'))
    await cp(path.join(__dirname, 'fixtures'), directory, { recursive: true })
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    await rm(directory, { recursive: true, force: true })
  })

  it('discovers stable sorted IDs and preserves distinct requested profiles', async () => {
    const config = parseTestConfig({
      projects: [
        { name: 'dev', environment: 'rsc' },
        { name: 'prod', environment: 'rsc', mode: 'production' },
      ],
    })
    const projects = await discoverTests(directory, config)
    expect(projects.map((p) => p.entries.map((e) => e.id))).toEqual([
      ['dev:math.spec.ts', 'dev:nested/page.rsc.spec.tsx'],
      ['prod:math.spec.ts', 'prod:nested/page.rsc.spec.tsx'],
    ])
    expect(projects[1].entries[0].profile.mode).toBe('production')
    expect(path.isAbsolute(projects[0].entries[0].file)).toBe(true)
  })

  it('normalizes registered fixture identities and excludes fixture modules from specs', async () => {
    const config = parseTestConfig({
      projects: [
        {
          name: 'browser',
          environment: 'browser',
          browserFixtures: [{ id: 'counter', module: 'math.spec.ts' }],
        },
      ],
    })
    const [project] = await discoverTests(directory, config)
    expect(project.browserFixtures).toEqual([
      {
        id: 'counter',
        module: await realpath(path.join(directory, 'math.spec.ts')),
        exportName: 'default',
      },
    ])
    expect(project.entries.map((entry) => entry.id)).toEqual([
      'browser:nested/page.rsc.spec.tsx',
    ])
  })

  it('rejects duplicate and unsupported fixture registrations', () => {
    const fixture = { id: 'counter', module: 'math.spec.ts' }
    expect(() =>
      parseTestConfig({
        projects: [{ name: 'node', browserFixtures: [fixture] }],
      })
    ).toThrow('development browser')
    expect(() =>
      parseTestConfig({
        projects: [
          {
            name: 'browser',
            environment: 'browser',
            mode: 'production',
            browserFixtures: [fixture],
          },
        ],
      })
    ).toThrow('development browser')
    expect(() =>
      parseTestConfig({
        projects: [
          {
            name: 'browser',
            environment: 'browser',
            browserFixtures: [fixture, fixture],
          },
        ],
      })
    ).toThrow('Duplicate browser fixture ID')
    expect(() =>
      parseTestConfig({
        projects: [
          {
            name: 'browser',
            environment: 'browser',
            browserFixtures: [{ ...fixture, exportName: '' }],
          },
        ],
      })
    ).toThrow('JavaScript identifier')
  })

  it('rejects fixture symlinks escaping the application', async () => {
    const outside = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-fixture-outside-')
    )
    try {
      await writeFile(path.join(outside, 'fixture.ts'), 'export default 1')
      await symlink(
        path.join(outside, 'fixture.ts'),
        path.join(directory, 'fixture.ts')
      )
      const config = parseTestConfig({
        projects: [
          {
            name: 'browser',
            environment: 'browser',
            browserFixtures: [{ id: 'outside', module: 'fixture.ts' }],
          },
        ],
      })
      await expect(discoverTests(directory, config)).rejects.toThrow(
        'Browser fixture must be inside the project'
      )
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects coverage combinations before loading configuration', async () => {
    for (const options of [{ watch: true }, { list: true }]) {
      await expect(
        nextTestRunner(path.join(directory, 'missing'), {
          ...options,
          coverage: true,
        })
      ).rejects.toThrow('--coverage requires a one-shot')
    }
    await expect(
      nextTestRunner(path.join(directory, 'missing'), {
        capabilities: true,
        coverage: true,
      })
    ).rejects.toThrow('--capabilities cannot')
  })

  it('rejects coverage snapshot updates before configuration or compilation', async () => {
    await expect(
      nextTestRunner(path.join(directory, 'missing'), {
        coverage: true,
        update: true,
      })
    ).rejects.toThrow('--coverage cannot be combined with --update')
    await expect(
      runTests(directory, [], {
        signal: new AbortController().signal,
        write: () => {},
        coverage: true,
        updateSnapshots: true,
      })
    ).rejects.toThrow('Coverage cannot be combined with snapshot updates')
    expect(createTestCompilerSession).not.toHaveBeenCalled()
  })

  it('applies include, exclude, project and file selection', async () => {
    const config = parseTestConfig({
      projects: [
        { name: 'unit', exclude: ['**/*.rsc.spec.tsx'] },
        { name: 'rsc', environment: 'rsc', include: ['**/*.rsc.spec.tsx'] },
      ],
    })
    const selected = await discoverTests(directory, config, {
      project: 'rsc',
      files: ['nested/'],
    })
    expect(selected.flatMap((p) => p.entries.map((e) => e.id))).toEqual([
      'rsc:nested/page.rsc.spec.tsx',
    ])
    await expect(
      discoverTests(directory, config, { project: 'missing' })
    ).rejects.toThrow('Unknown test project')
  })

  it('ignores hidden, dependency, and symlinked trees without following cycles', async () => {
    for (const name of ['.next', 'node_modules', '.git']) {
      await mkdir(path.join(directory, name))
      await writeFile(path.join(directory, name, 'ignored.spec.ts'), '')
    }
    await symlink(directory, path.join(directory, 'cycle'), 'dir')
    const projects = await discoverTests(directory, parseTestConfig({}))
    expect(projects[0].entries).toHaveLength(2)
  })

  it('resolves setup files and does not also collect them as specs', async () => {
    const config = parseTestConfig({
      projects: [{ name: 'unit', setupFiles: ['math.spec.ts'] }],
    })
    const [project] = await discoverTests(directory, config)
    expect(project.setupFiles[0]).toMatch(/math\.spec\.ts$/)
    expect(project.entries.map((entry) => entry.id)).toEqual([
      'unit:nested/page.rsc.spec.tsx',
    ])
  })

  it('publishes capabilities without reading project configuration or compiling', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    await nextTestRunner(path.join(directory, 'missing'), {
      capabilities: true,
    })
    const inventory = JSON.parse(log.mock.calls[0][0])
    expect(inventory.version).toBe(1)
    expect(inventory.execution.modes).toEqual(['development', 'production'])
    expect(inventory.features.production.supported).toBe(true)
    expect(inventory.features.production.environments).toEqual([
      'node',
      'rsc',
      'browser',
    ])
    expect(inventory.features.browserComponents).toMatchObject({
      supported: true,
      mode: 'development',
      browser: 'chromium',
    })
    expect(inventory.features.coverage).toMatchObject({
      supported: true,
      mode: 'development',
      environment: 'node',
      execution: 'opt-in one-shot',
      reports: ['json', 'text'],
    })
    expect(inventory.features.coverage.metric).toContain(
      'non-whitespace mapped generated spans'
    )
    expect(inventory.features.coverage.unsupported).toContain(
      'combining coverage with snapshot updates'
    )
    expect(inventory.features.snapshotUpdate.supported).toBe(true)
    expect(inventory.features.watch.supported).toBe(true)
    expect(inventory.features.staticFactoryMocks).toMatchObject({
      supported: true,
      api: 'vi.mock',
    })
  })

  it.each([
    [{ watch: true, run: true }, '--watch cannot be combined'],
    [{ watch: true, update: true }, '--watch cannot be combined'],
    [{ watch: true, list: true }, '--watch cannot be combined'],
    [{ list: true, update: true }, '--update cannot be combined'],
    [{ capabilities: true, run: true }, '--capabilities cannot be combined'],
  ])(
    'rejects unavailable or conflicting CLI options %#',
    async (options, message) => {
      await expect(nextTestRunner(directory, options)).rejects.toThrow(message)
    }
  )

  it('rejects browser snapshot updates before compiling or starting resources', async () => {
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({
        projects: [{ name: 'browser', environment: 'browser' }],
      })
    )
    const projects = await discoverTests(
      directory,
      await loadTestConfig(directory)
    )
    await expect(
      runTests(directory, projects, {
        signal: new AbortController().signal,
        write: () => {},
        updateSnapshots: true,
      })
    ).rejects.toThrow(
      'Browser snapshot updates require parent-owned snapshot commit'
    )
    expect(createTestCompilerSession).not.toHaveBeenCalled()
  })

  it('rejects setup symlinks outside the project', async () => {
    await symlink(__filename, path.join(directory, 'outside.ts'))
    await expect(
      discoverTests(
        directory,
        parseTestConfig({
          projects: [{ name: 'unit', setupFiles: ['outside.ts'] }],
        })
      )
    ).rejects.toThrow('Setup file must be inside the project')
  })

  it('rejects duplicate canonical setup identities instead of silently evaluating once', async () => {
    await expect(
      discoverTests(
        directory,
        parseTestConfig({
          projects: [{ name: 'unit', setupFiles: ['setup.ts', './setup.ts'] }],
        })
      )
    ).rejects.toThrow('Duplicate setup files are unsupported')
  })

  it.each([
    { plugins: [] },
    { resolve: { alias: {} } },
    { define: { NODE_ENV: 'test' } },
    { projects: [{ name: 'node', environment: 'jsdom' }] },
    { projects: [{ name: 'node', mode: 'test' }] },
    { projects: [{ name: 'node', mode: null }] },
    { projects: [{ name: 'node', environment: null }] },
    { projects: [{ name: 'node', testTimeout: 0 }] },
    { projects: [{ name: 'node', hookTimeout: Infinity }] },
    { projects: [{ name: 'node', fileTimeout: 0 }] },
    { projects: [{ name: 'node', testTimeout: 300000 }] },
    { projects: [{ name: 'node', hookTimeout: 300000 }] },
    { projects: [{ name: 'same' }, { name: 'same' }] },
    { projects: [] },
    { projects: null },
  ])('rejects conflicting or unsupported config %#', (config) => {
    expect(() => parseTestConfig(config)).toThrow(
      'Invalid next.test.config.json'
    )
  })

  it('rejects production route context before compilation', async () => {
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({
        projects: [
          {
            name: 'rsc',
            environment: 'rsc',
            mode: 'production',
            route: '/subject',
          },
        ],
      })
    )
    await expect(nextTestRunner(directory, {})).rejects.toThrow(
      'Production test execution supports route-less profiles only'
    )
  })

  it('loads JSON without changing NODE_ENV', async () => {
    const previous = process.env.NODE_ENV
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({ projects: [{ name: 'production', mode: 'production' }] })
    )
    expect((await loadTestConfig(directory)).projects[0].profile.mode).toBe(
      'production'
    )
    expect(process.env.NODE_ENV).toBe(previous)
  })

  it('does not expose config contents in JSON syntax errors', async () => {
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      '{ "credential": "sensitive-example" broken }'
    )
    await expect(loadTestConfig(directory)).rejects.toThrow(
      'The file must contain valid JSON.'
    )
    await expect(loadTestConfig(directory)).rejects.not.toThrow(
      'sensitive-example'
    )
  })

  it('rejects ignored alternative configuration instead of silently running defaults', async () => {
    await writeFile(
      path.join(directory, 'vitest.config.ts'),
      'throw new Error()'
    )
    await expect(loadTestConfig(directory)).rejects.toThrow(
      'Unsupported test configuration: vitest.config.ts'
    )
  })

  it('lists requested profiles and fails visibly when selection is empty', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    await nextTestRunner(directory, { list: true, filter: ['math'] })
    expect(log).toHaveBeenCalledWith(
      'default:math.spec.ts [node, development, nodejs, turbopack]'
    )
    await expect(
      nextTestRunner(directory, { list: true, filter: ['missing'] })
    ).rejects.toThrow('No test files matched')
  })
})

// These test orchestration with real K reporting and controlled producer seams.
// Actual compilation/worker integration has a separate native acceptance gate.
describe('Next test orchestration', () => {
  const createSession = jest.mocked(createTestCompilerSession)
  const executeFile = jest.mocked(execute)
  const createServer = jest.mocked(createApplicationServer)
  const createBrowser = jest.mocked(createBrowserHost)
  let previousNodeEnv: string | undefined
  let project: DiscoveredTestProject
  let artifact: CompiledTestArtifact
  let compile: jest.Mock
  let dispose: jest.Mock
  let shutdownCompilation: jest.Mock
  let serverDispose: jest.Mock
  let browserDispose: jest.Mock

  beforeEach(() => {
    previousNodeEnv = process.env.NODE_ENV
    ;(process.env as any).NODE_ENV = 'development'
    jest.resetAllMocks()
    jest
      .mocked(capabilities.requireTestCapability)
      .mockImplementation(
        jest.requireActual('next/dist/experimental/testing/capabilities')
          .requireTestCapability
      )
    const config = parseTestConfig({
      projects: [{ name: 'rsc', environment: 'rsc' }],
    })
    project = { ...config.projects[0], entries: [] }
    project.entries.push({
      id: 'rsc:page.spec.tsx',
      file: '/application/page.spec.tsx',
      profile: project.profile,
    })
    artifact = {
      version: 2,
      kind: 'rsc',
      entryId: project.entries[0].id,
      profile: { ...project.profile, environment: 'rsc' },
      revision: 'immutable-1',
      rootDir: '/snapshots/immutable-1',
      entryPath: 'entry.js',
      manifestPage: '/__next_test__/fixture/page',
      manifests: {
        clientReference: 'client.js',
        serverActions: 'actions.json',
      },
      files: ['entry.js', 'client.js', 'actions.json'],
      diagnostics: [],
    }
    compile = jest.fn().mockResolvedValue(artifact)
    dispose = jest.fn().mockResolvedValue(undefined)
    shutdownCompilation = jest.fn().mockResolvedValue(undefined)
    serverDispose = jest.fn().mockResolvedValue(undefined)
    browserDispose = jest.fn().mockResolvedValue(undefined)
    createServer.mockResolvedValue({
      baseURL: 'http://127.0.0.1:1234',
      pid: 123,
      lifetime: 'file',
      attachments: [],
      dispose: serverDispose,
    })
    createBrowser.mockResolvedValue({
      wsEndpoint: 'ws://127.0.0.1/browser',
      dispose: browserDispose,
    })
    const session = {
      compile,
      dispose,
      shutdownCompilation,
    }
    createSession.mockResolvedValue(session)
    executeFile.mockImplementation(async (input, options) => {
      const envelope = {
        version: 1 as const,
        runId: options.runId,
        timestamp: Date.now(),
      }
      options.onEvent({
        ...envelope,
        type: 'file-start',
        entry: options.entry,
        revision: input.revision,
      })
      const result = {
        entryId: input.entryId,
        status: 'passed' as const,
        durationMs: 1,
      }
      options.onEvent({ ...envelope, type: 'file-end', ...result })
      return result
    })
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    if (previousNodeEnv === undefined) delete (process.env as any).NODE_ENV
    else (process.env as any).NODE_ENV = previousNodeEnv
    // Production retains attachment roots; these controlled seams create no
    // report artifacts, so remove their temporary directories after each case.
    await Promise.all(
      createServer.mock.calls.map(([options]) =>
        rm(options.outputDir, { recursive: true, force: true })
      )
    )
  })

  async function run(
    signal = new AbortController().signal,
    write = jest.fn(),
    onEvent?: (event: ResultEvent) => void
  ) {
    return runTests('/application', [project], { signal, write, onEvent })
  }

  it('forwards setup identities in declared order to compilation and execution', async () => {
    project.setupFiles = ['/application/second.ts', '/application/first.ts']
    await run()
    expect(compile).toHaveBeenCalledWith(project.entries[0], {
      signal: expect.any(AbortSignal),
      setupFiles: project.setupFiles,
    })
    expect(executeFile.mock.calls[0][1].setupFiles).toEqual(project.setupFiles)
  })

  it('forwards snapshot updates only for an explicit one-shot opt-in', async () => {
    await run()
    expect(executeFile.mock.calls[0][1].updateSnapshots).toBe(false)
    await runTests('/application', [project], {
      signal: new AbortController().signal,
      write: jest.fn(),
      updateSnapshots: true,
    })
    expect(executeFile.mock.calls[1][1].updateSnapshots).toBe(true)
  })

  it('distinguishes ordinary failures from unsafe compiler disposal for repeated runs', async () => {
    compile.mockRejectedValue(new Error('Invalid source'))
    expect(await run()).toMatchObject({
      status: 'failed',
      unsafeCleanup: false,
    })
    dispose.mockRejectedValue(new Error('Compiler output owner remains alive'))
    expect(await run()).toMatchObject({ status: 'failed', unsafeCleanup: true })
  })

  it('watches with fresh runs, reloads configuration, and closes after resource cleanup', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-cli-')
    )
    const controller = new AbortController()
    const close = jest.fn().mockResolvedValue(undefined)
    const update = jest.fn().mockResolvedValue(undefined)
    jest.mocked(watchTestFiles).mockResolvedValue({ close, update })
    jest
      .mocked(runWatchProcess)
      .mockImplementation(async (request, options) => {
        if (request.operation === 'run') {
          const result = await runTests(
            request.projectDir,
            request.projects,
            options
          )
          options.signal.throwIfAborted()
          return {
            operation: 'run',
            result,
          }
        }
        return {
          operation: 'metadata',
          directories: {
            directories: [directory],
            outputDirectories: [path.join(directory, 'custom-output')],
            artifactDirectories: [
              {
                parentDirectory: directory,
                basenamePrefixes: ['.next-test-', '.next-test-pending-'],
              },
            ],
          },
        }
      })
    let firstExecuting!: () => void
    const first = new Promise<void>((resolve) => {
      firstExecuting = resolve
    })
    const runs: string[] = []
    let disposals = 0
    const executeNormally = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (input, options) => {
      runs.push(options.runId)
      if (runs.length === 1) {
        firstExecuting()
        await new Promise<void>((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(options.signal.reason),
            { once: true }
          )
        })
      }
      return executeNormally(input, options)
    })
    compile.mockImplementation(async (entry) => ({
      ...artifact,
      entryId: entry.id,
      profile: entry.profile,
    }))
    dispose.mockImplementation(async () => {
      disposals++
      if (disposals === 2) controller.abort(new Error('Finished watch test'))
    })
    try {
      await writeFile(path.join(directory, 'first.spec.ts'), '')
      const configFile = path.join(directory, 'next.test.config.json')
      await writeFile(
        configFile,
        JSON.stringify({ projects: [{ name: 'rsc', environment: 'rsc' }] })
      )
      const running = watchTests(directory, {
        signal: controller.signal,
        write: jest.fn(),
      })
      await first
      await writeFile(path.join(directory, 'setup.ts'), '')
      await writeFile(
        configFile,
        JSON.stringify({
          projects: [
            { name: 'rsc', environment: 'rsc', setupFiles: ['setup.ts'] },
          ],
        })
      )
      jest
        .mocked(watchTestFiles)
        .mock.calls[0][0].onChange({ changed: [configFile], removed: [] })
      expect(await running).toEqual({ status: 'cancelled' })
      expect(new Set(runs).size).toBe(2)
      expect(
        jest
          .mocked(runWatchProcess)
          .mock.calls.filter(([request]) => request.operation === 'run')
          .map(([, options]) => options.reporter?.rerun)
      ).toEqual([false, true])
      expect(compile.mock.calls[1][1].setupFiles).toEqual([
        await realpath(path.join(directory, 'setup.ts')),
      ])
      expect(update).toHaveBeenCalled()
      expect(close).toHaveBeenCalledTimes(1)
      expect(disposals).toBe(2)
    } finally {
      controller.abort()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reloads actual Next config and environment in fresh metadata processes', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-config-')
    )
    const { runWatchProcess: actualRun } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    try {
      const config = path.join(directory, 'next.config.mjs')
      const env = path.join(directory, '.env.local')
      await writeFile(
        config,
        'console.log("config stdout"); console.error("config stderr"); export default { distDir: process.env.NEXT_TEST_WATCH_OUTPUT }'
      )
      await writeFile(env, 'NEXT_TEST_WATCH_OUTPUT=first-output\n')
      const request = {
        operation: 'metadata' as const,
        projectDir: directory,
        profiles: [project.profile],
      }
      const writeError = jest.fn()
      const options = {
        signal: new AbortController().signal,
        write: jest.fn(),
        reporter: { writeError },
      }
      const first = await actualRun(request, options)
      expect(options.write.mock.calls.map(([text]) => text).join('')).toContain(
        'config stdout'
      )
      expect(
        options.write.mock.calls.map(([text]) => text).join('')
      ).not.toContain('config stderr')
      expect(writeError.mock.calls.map(([text]) => text).join('')).toContain(
        'config stderr'
      )
      expect(first).toMatchObject({
        operation: 'metadata',
        directories: {
          outputDirectories: [path.join(directory, 'first-output', 'dev')],
        },
      })
      await writeFile(
        config,
        'export default { distDir: "changed-" + process.env.NEXT_TEST_WATCH_OUTPUT }'
      )
      await writeFile(env, 'NEXT_TEST_WATCH_OUTPUT=second-output\n')
      const second = await actualRun(request, options)
      expect(second).toMatchObject({
        operation: 'metadata',
        directories: {
          outputDirectories: [
            path.join(directory, 'changed-second-output', 'dev'),
          ],
        },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  it.each(['update', 'ownership'] as const)(
    'stops watch when %s failure leaves no trustworthy change source or owner',
    async (failureKind) => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'next-testing-watch-fatal-')
      )
      const controller = new AbortController()
      const close = jest.fn().mockResolvedValue(undefined)
      const update = jest.fn().mockResolvedValue(undefined)
      const write = jest.fn()
      if (failureKind === 'update')
        update
          .mockResolvedValueOnce(undefined)
          .mockRejectedValue(new Error('Subscription update failed'))
      jest.mocked(watchTestFiles).mockResolvedValue({ close, update })
      let completed!: () => void
      const first = new Promise<void>((resolve) => {
        completed = resolve
      })
      let metadataCalls = 0
      jest
        .mocked(runWatchProcess)
        .mockImplementation(async (request, options) => {
          if (request.operation === 'metadata') {
            metadataCalls++
            if (failureKind === 'ownership' && metadataCalls === 3)
              throw new WatchOwnershipError(new Error('Group still alive'))
            return {
              operation: 'metadata',
              directories: { directories: [directory], outputDirectories: [] },
            }
          }
          const result = await runTests(
            request.projectDir,
            request.projects,
            options
          )
          completed()
          return { operation: 'run', result }
        })
      compile.mockImplementation(async (entry) => ({
        ...artifact,
        entryId: entry.id,
        profile: entry.profile,
      }))
      let running: ReturnType<typeof watchTests> | undefined
      try {
        await writeFile(path.join(directory, 'first.spec.ts'), '')
        running = watchTests(directory, {
          signal: controller.signal,
          write,
        })
        await first
        jest
          .mocked(watchTestFiles)
          .mock.calls[0][0].onChange({ changed: [directory], removed: [] })
        expect(await running).toEqual({ status: 'failed' })
        expect(executeFile).toHaveBeenCalledTimes(1)
        expect(close).toHaveBeenCalledTimes(1)
        expect(metadataCalls).toBe(3)
        expect(write).toHaveBeenCalledWith(
          expect.stringContaining(
            failureKind === 'ownership'
              ? 'Watch generation cleanup failed'
              : 'Subscription update failed'
          )
        )
      } finally {
        controller.abort()
        await running?.catch(() => {})
        await rm(directory, { recursive: true, force: true })
      }
    }
  )

  it('bounds a completed metadata process that retains a live configuration handle', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-terminal-')
    )
    const { runWatchProcess: actualRun } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    try {
      await writeFile(
        path.join(directory, 'next.config.mjs'),
        `
        import { writeFileSync } from 'node:fs'
        writeFileSync(new URL('./coordinator.pid', import.meta.url), String(process.pid))
        setInterval(() => {}, 1000)
        export default {}
      `
      )
      await expect(
        actualRun(
          {
            operation: 'metadata',
            projectDir: directory,
            profiles: [project.profile],
          },
          { signal: new AbortController().signal, write: jest.fn() }
        )
      ).rejects.toThrow('did not exit after completing or disconnecting')
      const pid = Number(
        await readFile(path.join(directory, 'coordinator.pid'), 'utf8')
      )
      expect(() => process.kill(pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  it('accepts normal metadata exit while reclaiming a descendant that retains output and ignores SIGTERM', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-inherited-output-')
    )
    const { runWatchProcess: actualRun } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    try {
      await writeFile(
        path.join(directory, 'next.config.mjs'),
        `
        import { spawn } from 'node:child_process'
        import { writeFileSync } from 'node:fs'
        const child = spawn(process.execPath, ['-e', \`
          process.on('SIGTERM', () => {})
          setInterval(() => {}, 1000)
          process.send('ready')
        \`], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
        await new Promise((resolve, reject) => {
          child.once('message', resolve)
          child.once('error', reject)
        })
        writeFileSync(new URL('./descendant.pid', import.meta.url), String(child.pid))
        child.disconnect()
        child.unref()
        export default {}
      `
      )
      await expect(
        actualRun(
          {
            operation: 'metadata',
            projectDir: directory,
            profiles: [project.profile],
          },
          { signal: new AbortController().signal, write: jest.fn() }
        )
      ).resolves.toMatchObject({ operation: 'metadata' })
      const pid = Number(
        await readFile(path.join(directory, 'descendant.pid'), 'utf8')
      )
      expect(() => process.kill(pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  it('reclaims inherited descendants after a metadata result followed by a process crash', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-crash-')
    )
    const { runWatchProcess: actualRun } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    try {
      await writeFile(
        path.join(directory, 'next.config.mjs'),
        `
        import { spawn } from 'node:child_process'
        import { writeFileSync } from 'node:fs'
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
        writeFileSync(new URL('./descendant.pid', import.meta.url), String(child.pid))
        process.once('disconnect', () => process.exit(7))
        export default {}
      `
      )
      await expect(
        actualRun(
          {
            operation: 'metadata',
            projectDir: directory,
            profiles: [project.profile],
          },
          { signal: new AbortController().signal, write: jest.fn() }
        )
      ).rejects.toThrow('failed to close successfully (7)')
      const pid = Number(
        await readFile(path.join(directory, 'descendant.pid'), 'utf8')
      )
      expect(() => process.kill(pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  it('bounds cancelled configuration evaluation without changing cancellation to failure', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-watch-cancel-')
    )
    const controller = new AbortController()
    const { runWatchProcess: actualRun } = jest.requireActual<
      typeof import('next/dist/experimental/testing/watch-process')
    >('next/dist/experimental/testing/watch-process')
    let started!: () => void
    const ready = new Promise<void>((resolve) => {
      started = resolve
    })
    let running: ReturnType<typeof actualRun> | undefined
    try {
      await writeFile(
        path.join(directory, 'next.config.mjs'),
        `
        console.log('watch-config-started')
        await new Promise(() => {})
        export default {}
      `
      )
      running = actualRun(
        {
          operation: 'metadata',
          projectDir: directory,
          profiles: [project.profile],
        },
        {
          signal: controller.signal,
          write(text) {
            if (text.includes('watch-config-started')) started()
          },
        }
      )
      await Promise.race([
        ready,
        running.then(() => {
          throw new Error('Expected blocked configuration')
        }),
      ])
      const reason = new Error('Cancel configuration evaluation')
      controller.abort(reason)
      await expect(running).rejects.toBe(reason)
    } finally {
      controller.abort()
      await running?.catch(() => {})
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  function useBrowserProject() {
    const [config] = parseTestConfig({
      projects: [{ name: 'browser', environment: 'browser' }],
    }).projects
    const entry = {
      id: 'browser:flow.spec.ts',
      file: '/application/flow.spec.ts',
      profile: config.profile,
    }
    project = { ...config, entries: [entry] }
    artifact = {
      version: 2,
      kind: 'node',
      entryId: entry.id,
      profile: { ...entry.profile, environment: 'browser' },
      revision: 'browser-revision',
      rootDir: '/snapshots/browser-revision',
      entryPath: 'entry.js',
      files: ['entry.js'],
      diagnostics: [],
      applicationServer: { mode: 'development', lockDistDir: true },
    }
    compile.mockResolvedValue(artifact)
    return artifact
  }

  it('passes the exact artifact and application directory, then disposes after execution closes', async () => {
    const order: string[] = []
    const originalExecute = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (...args) => {
      const result = await originalExecute(...args)
      order.push('process closed')
      return result
    })
    dispose.mockImplementation(async () => {
      order.push('artifact disposed')
    })
    expect((await run()).status).toBe('passed')
    expect(executeFile).toHaveBeenCalledWith(
      artifact,
      expect.objectContaining({
        projectDir: '/application',
        entry: project.entries[0],
        testTimeout: 5000,
        hookTimeout: 10000,
      })
    )
    expect(order).toEqual(['process closed', 'artifact disposed'])
  })

  it('passes resolved production output evidence only after compiler shutdown', async () => {
    const compiled = useBrowserProject()
    ;(process.env as any).NODE_ENV = 'production'
    project.profile.mode = 'production'
    compiled.profile.mode = 'production'
    compiled.applicationServer = {
      mode: 'production',
      lockDistDir: true,
      distDir: '/application/custom-dist',
    }
    createServer.mockImplementation(async () => {
      expect(shutdownCompilation).toHaveBeenCalledTimes(1)
      return {
        baseURL: 'http://127.0.0.1:1234',
        pid: 123,
        lifetime: 'file',
        attachments: [],
        dispose: serverDispose,
      }
    })
    expect((await run()).status).toBe('passed')
    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'production',
        distDir: '/application/custom-dist',
      })
    )
  })

  it('rejects production drivers without resolved absolute application output evidence', async () => {
    const compiled = useBrowserProject()
    ;(process.env as any).NODE_ENV = 'production'
    project.profile.mode = 'production'
    compiled.profile.mode = 'production'
    compiled.applicationServer = { mode: 'production', lockDistDir: true }
    expect((await run()).status).toBe('failed')
    expect(createServer).not.toHaveBeenCalled()
  })

  function useCoverageProject() {
    jest.mocked(capabilities.requireTestCapability).mockImplementation(() => {})
    const config = parseTestConfig({ projects: [{ name: 'node' }] }).projects[0]
    project = {
      ...config,
      entries: [
        {
          id: 'node:unit.spec.ts',
          file: '/application/unit.spec.ts',
          profile: config.profile,
        },
      ],
    }
    artifact = {
      version: 2,
      kind: 'node',
      entryId: project.entries[0].id,
      profile: { ...config.profile, environment: 'node' },
      revision: 'coverage-revision',
      rootDir: '/snapshots/coverage',
      entryPath: 'entry.js',
      files: ['entry.js'],
      diagnostics: [],
      coverage: { version: 1, scripts: [], sources: {} },
    }
    compile.mockResolvedValue(artifact)
  }

  it('awaits coverage remapping before artifact disposal and reports before run-end', async () => {
    useCoverageProject()
    const order: string[] = []
    jest.mocked(remapCoverage).mockImplementation(async (input) => {
      expect(dispose).not.toHaveBeenCalled()
      order.push('remapped')
      return {
        version: 1,
        entryId: input.entryId,
        revision: input.revision,
        complete: true,
        errors: [],
        files: [],
      }
    })
    const originalExecute = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (input, options) => {
      await options.onCoverage!({
        version: 1,
        runId: options.runId,
        entryId: input.entryId,
        revision: input.revision,
        complete: true,
        data: { version: 1, scripts: [] },
      })
      return originalExecute(input, options)
    })
    dispose.mockImplementation(async () => {
      order.push('disposed')
    })
    const events: any[] = []
    try {
      const result = await runTests('/application', [project], {
        signal: new AbortController().signal,
        write: () => {},
        coverage: true,
        onEvent: (event) => events.push(event),
      })
      expect(result.status).toBe('passed')
      expect(order).toEqual(['remapped', 'disposed'])
      expect(compile.mock.calls[0][1].coverage).toEqual({
        version: 1,
        kind: 'node-line',
      })
      expect(events.at(-1).type).toBe('run-end')
      const attachments = events.filter((event) => event.type === 'attachment')
      expect(attachments.map((event) => event.attachment.name)).toEqual([
        'coverage.json',
        'coverage.txt',
      ])
      expect(
        JSON.parse(await readFile(attachments[0].attachment.path, 'utf8'))
          .complete
      ).toBe(true)
    } finally {
      for (const event of events.filter(
        (event) => event.type === 'attachment'
      )) {
        await rm(path.dirname(event.attachment.path), {
          recursive: true,
          force: true,
        })
      }
    }
  })

  it('keeps an interrupted coverage run cancelled and publishes no successful report', async () => {
    useCoverageProject()
    const controller = new AbortController()
    const events: any[] = []
    const originalExecute = executeFile.getMockImplementation()!
    jest.mocked(remapCoverage).mockImplementation(async (input) => {
      controller.abort(new Error('Interrupted during remap'))
      return {
        version: 1,
        entryId: input.entryId,
        revision: input.revision,
        complete: true,
        errors: [],
        files: [],
      }
    })
    executeFile.mockImplementation(async (input, options) => {
      await options.onCoverage!({
        version: 1,
        runId: options.runId,
        entryId: input.entryId,
        revision: input.revision,
        complete: true,
        data: { version: 1, scripts: [] },
      })
      return originalExecute(input, options)
    })
    const result = await runTests('/application', [project], {
      signal: controller.signal,
      write: () => {},
      coverage: true,
      onEvent: (event) => events.push(event),
    })
    expect(result.status).toBe('cancelled')
    expect(events.filter((event) => event.type === 'attachment')).toEqual([])
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects a coverage completion for another artifact revision before remapping', async () => {
    useCoverageProject()
    const events: any[] = []
    executeFile.mockImplementation(async (input, options) => {
      await options.onCoverage!({
        version: 1,
        runId: options.runId,
        entryId: input.entryId,
        revision: 'stale',
        complete: true,
        data: { version: 1, scripts: [] },
      })
      throw new Error('Must not accept stale capture')
    })
    try {
      const result = await runTests('/application', [project], {
        signal: new AbortController().signal,
        write: () => {},
        coverage: true,
        onEvent: (event) => events.push(event),
      })
      expect(result.status).toBe('failed')
      expect(remapCoverage).not.toHaveBeenCalled()
      expect(
        events.some(
          (event) =>
            event.type === 'diagnostic' &&
            event.diagnostic.message.includes('Invalid or duplicate')
        )
      ).toBe(true)
    } finally {
      for (const event of events.filter(
        (event) => event.type === 'attachment'
      )) {
        await rm(path.dirname(event.attachment.path), {
          recursive: true,
          force: true,
        })
      }
    }
  })

  it('fails missing coverage completion instead of publishing a successful percentage', async () => {
    useCoverageProject()
    const events: any[] = []
    try {
      const result = await runTests('/application', [project], {
        signal: new AbortController().signal,
        write: () => {},
        coverage: true,
        onEvent: (event) => events.push(event),
      })
      expect(result.status).toBe('failed')
      const reportEvent = events.find(
        (event) =>
          event.type === 'attachment' &&
          event.attachment.name === 'coverage.json'
      )
      const report = JSON.parse(
        await readFile(reportEvent.attachment.path, 'utf8')
      )
      expect(report.complete).toBe(false)
      expect(report.totals.percent).toBeNull()
      expect(remapCoverage).not.toHaveBeenCalled()
    } finally {
      for (const event of events.filter(
        (event) => event.type === 'attachment'
      )) {
        await rm(path.dirname(event.attachment.path), {
          recursive: true,
          force: true,
        })
      }
    }
  })

  it('reports compilation failure as a failed file and disposes the session', async () => {
    compile.mockRejectedValue(new Error('Invalid server-only boundary'))
    const write = jest.fn()
    const summary = await run(undefined, write)
    expect(summary.status).toBe('failed')
    expect(summary.files.failed).toBe(1)
    expect(write.mock.calls.flat().join('')).toContain('[compilation]')
    expect(write.mock.calls.flat().join('')).toContain('Failed Suites 1')
    expect(executeFile).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('forwards a Node artifact without manufacturing RSC manifests or request state', async () => {
    const [config] = parseTestConfig({
      projects: [{ name: 'node', environment: 'node' }],
    }).projects
    const entry = {
      id: 'node:unit.spec.ts',
      file: '/application/unit.spec.ts',
      profile: config.profile,
    }
    project = { ...config, entries: [entry] }
    artifact = {
      version: 2,
      kind: 'node',
      entryId: entry.id,
      profile: { ...entry.profile, environment: 'node' },
      revision: 'node-revision',
      rootDir: '/snapshots/node-revision',
      entryPath: 'entry.js',
      files: ['entry.js'],
      diagnostics: [],
    }
    compile.mockResolvedValue(artifact)
    expect((await run()).status).toBe('passed')
    expect(executeFile.mock.calls[0][0]).toBe(artifact)
    expect(executeFile.mock.calls[0][0]).not.toHaveProperty('manifests')
    expect(executeFile.mock.calls[0][0]).not.toHaveProperty('requestContext')
  })

  it('passes an explicitly extended file budget without silently capping long cases or hooks', async () => {
    const config = parseTestConfig({
      projects: [
        {
          name: 'rsc',
          environment: 'rsc',
          testTimeout: 300000,
          hookTimeout: 180000,
          fileTimeout: 600000,
        },
      ],
    })
    project = { ...config.projects[0], entries: project.entries }
    expect((await run()).status).toBe('passed')
    expect(executeFile).toHaveBeenCalledWith(
      artifact,
      expect.objectContaining({
        testTimeout: 300000,
        hookTimeout: 180000,
        fileTimeout: 600000,
      })
    )
  })

  it('never executes an artifact containing error diagnostics', async () => {
    artifact.diagnostics.push({
      phase: 'compilation',
      severity: 'error',
      message: 'Invalid artifact',
    })
    expect((await run()).status).toBe('failed')
    expect(executeFile).not.toHaveBeenCalled()
  })

  it('reports unsupported profile/session startup instead of a zero-file passing run', async () => {
    createSession.mockRejectedValue(
      new Error('Unsupported actual compilation profile')
    )
    const summary = await run()
    expect(summary.status).toBe('failed')
    expect(summary.files.failed).toBe(1)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('reports executor exceptions and cleanup failures before run-end', async () => {
    executeFile.mockRejectedValue(new Error('Worker crashed'))
    dispose.mockRejectedValue(new Error('Snapshot removal failed'))
    const write = jest.fn()
    const events: ResultEvent[] = []
    const summary = await run(undefined, write, (event) => events.push(event))
    const output = write.mock.calls.flat().join('')
    expect(summary.status).toBe('failed')
    expect(summary.errors).toBe(2)
    expect(output).toContain('Snapshot removal failed')
    const failure = events.findIndex(
      (event) =>
        event.type === 'diagnostic' &&
        event.diagnostic.message === 'Snapshot removal failed'
    )
    expect(failure).toBeGreaterThan(-1)
    expect(failure).toBeLessThan(
      events.findIndex((event) => event.type === 'run-end')
    )
  })

  it('lets the reporter reject a claimed pass with a failed emitted case', async () => {
    executeFile.mockImplementation(async (input, options) => {
      const envelope = {
        version: 1 as const,
        runId: options.runId,
        timestamp: Date.now(),
      }
      options.onEvent({
        ...envelope,
        type: 'case-end',
        entryId: input.entryId,
        caseId: 'case',
        attempt: { id: 'case:0', retry: 0, repeat: 0 },
        name: 'fails',
        status: 'failed',
        durationMs: 1,
        errors: [],
      })
      return { entryId: input.entryId, status: 'passed', durationMs: 1 }
    })
    expect((await run()).status).toBe('failed')
  })

  it('waits for cancelled execution to close before releasing the artifact', async () => {
    const controller = new AbortController()
    let startedExecution!: () => void
    const executing = new Promise<void>((resolve) => {
      startedExecution = resolve
    })
    let closed = false
    executeFile.mockImplementation(async (input, options) => {
      startedExecution()
      await new Promise<void>((resolve) =>
        options.signal.addEventListener('abort', () => resolve(), {
          once: true,
        })
      )
      closed = true
      return { entryId: input.entryId, status: 'cancelled', durationMs: 1 }
    })
    dispose.mockImplementation(async () => {
      expect(closed).toBe(true)
    })
    const running = run(controller.signal)
    await executing
    controller.abort()
    expect((await running).status).toBe('cancelled')
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('aborts on reporter failure but still disposes acquired sessions', async () => {
    await expect(
      run(
        undefined,
        jest.fn(() => {
          if (createSession.mock.calls.length)
            throw new Error('Output stream failed')
        })
      )
    ).rejects.toThrow('Output stream failed')
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects mixed modes and NODE_ENV conflicts before compiler setup', async () => {
    const production = {
      ...project,
      profile: { ...project.profile, mode: 'production' as const },
    }
    const options = { signal: new AbortController().signal, write: jest.fn() }
    expect(
      (await runTests('/application', [project, production], options)).status
    ).toBe('failed')
    ;(process.env as any).NODE_ENV = 'test'
    expect((await run()).status).toBe('failed')
    expect(createSession).not.toHaveBeenCalled()
    expect(process.env.NODE_ENV).toBe('test')
  })

  it('compiles all browser drivers before handing output ownership to per-file servers', async () => {
    useBrowserProject()
    project.entries.push({
      ...project.entries[0],
      id: 'browser:second.spec.ts',
      file: '/application/second.spec.ts',
    })
    const order: string[] = []
    compile.mockImplementation(async (entry) => {
      order.push(`compile ${entry.id}`)
      return { ...artifact, entryId: entry.id }
    })
    shutdownCompilation.mockImplementation(async () => {
      order.push('native shutdown')
    })
    const originalServer = createServer.getMockImplementation()!
    createServer.mockImplementation(async (options) => {
      order.push('server start')
      return originalServer(options)
    })
    const originalExecute = executeFile.getMockImplementation()!
    executeFile.mockImplementation(async (...args) => {
      const result = await originalExecute(...args)
      order.push('driver closed')
      return result
    })
    browserDispose.mockImplementation(async () => {
      order.push('browser disposed')
    })
    serverDispose.mockImplementation(async () => {
      order.push('server disposed')
    })
    dispose.mockImplementation(async () => {
      order.push('snapshots disposed')
    })
    expect((await run()).status).toBe('passed')
    expect(order).toEqual([
      'compile browser:flow.spec.ts',
      'compile browser:second.spec.ts',
      'native shutdown',
      'server start',
      'driver closed',
      'browser disposed',
      'server disposed',
      'server start',
      'driver closed',
      'browser disposed',
      'server disposed',
      'snapshots disposed',
    ])
    expect(shutdownCompilation).toHaveBeenCalledTimes(1)
    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDir: '/application',
        mode: 'development',
        outputLockEnabled: true,
      })
    )
    const browser = executeFile.mock.calls[0][1].browser!
    expect(browser).toMatchObject({
      baseURL: 'http://127.0.0.1:1234',
      wsEndpoint: 'ws://127.0.0.1/browser',
    })
    expect(path.isAbsolute(browser.outputDir)).toBe(true)
    expect(browser.outputDir).not.toBe(artifact.rootDir)
  })

  it.each([undefined, false])(
    'rejects missing or false resolved locking evidence before server acquisition (%s)',
    async (enabled) => {
      const compiled = useBrowserProject()
      if (enabled === undefined) delete compiled.applicationServer
      else compiled.applicationServer!.lockDistDir = enabled
      expect((await run()).status).toBe('failed')
      expect(createServer).not.toHaveBeenCalled()
      expect(createBrowser).not.toHaveBeenCalled()
      expect(executeFile).not.toHaveBeenCalled()
    }
  )

  it('does not start app servers if native graph shutdown fails', async () => {
    useBrowserProject()
    shutdownCompilation.mockRejectedValue(new Error('Native shutdown failed'))
    expect((await run()).status).toBe('failed')
    expect(createServer).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('retains startup-log attachments and disposes compiler snapshots on server failure', async () => {
    useBrowserProject()
    createServer.mockRejectedValue(
      new ApplicationServerError(
        [new Error('App startup failed')],
        [
          {
            name: 'Server log',
            kind: 'file',
            path: '/owned/server.log',
            contentType: 'text/plain',
          },
        ]
      )
    )
    const summary = await run()
    expect(summary.status).toBe('failed')
    expect(summary.attachments).toBe(1)
    expect(createBrowser).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('disposes the app server after browser acquisition failure and preserves cleanup failure', async () => {
    useBrowserProject()
    createBrowser.mockRejectedValue(new Error('Chromium launch failed'))
    serverDispose.mockRejectedValue(new Error('Server cleanup failed'))
    const summary = await run()
    expect(summary.status).toBe('failed')
    expect(summary.errors).toBe(2)
    expect(serverDispose).toHaveBeenCalledTimes(1)
    expect(executeFile).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps browser/server leases until a cancelled driver closes and still attempts both disposals', async () => {
    useBrowserProject()
    const controller = new AbortController()
    let driverStarted!: () => void
    const startedDriver = new Promise<void>((resolve) => {
      driverStarted = resolve
    })
    let closed = false
    executeFile.mockImplementation(async (input, options) => {
      driverStarted()
      await new Promise<void>((resolve) =>
        options.signal.addEventListener('abort', () => resolve(), {
          once: true,
        })
      )
      expect(browserDispose).not.toHaveBeenCalled()
      expect(serverDispose).not.toHaveBeenCalled()
      closed = true
      return { entryId: input.entryId, status: 'cancelled', durationMs: 1 }
    })
    browserDispose.mockImplementation(async () => {
      expect(closed).toBe(true)
      throw new Error('Browser cleanup failed')
    })
    serverDispose.mockImplementation(async () => {
      expect(closed).toBe(true)
    })
    const running = run(controller.signal)
    await startedDriver
    controller.abort()
    const summary = await running
    expect(summary.status).toBe('failed')
    expect(summary.files.failed).toBe(1)
    expect(summary.files.cancelled).toBe(0)
    expect(browserDispose).toHaveBeenCalledTimes(1)
    expect(serverDispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('does not turn pure aggregated acquisition cancellation into a failure', async () => {
    useBrowserProject()
    const controller = new AbortController()
    createServer.mockImplementation(async () => {
      controller.abort()
      throw new ApplicationServerError([controller.signal.reason], [])
    })
    const summary = await run(controller.signal)
    expect(summary.status).toBe('cancelled')
    expect(summary.files.cancelled).toBe(1)
    expect(summary.files.failed).toBe(0)
    expect(createBrowser).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('does not acquire another app server after parent resource disposal fails', async () => {
    useBrowserProject()
    project.entries.push({
      ...project.entries[0],
      id: 'browser:second.spec.ts',
      file: '/application/second.spec.ts',
    })
    compile.mockImplementation(async (entry) => ({
      ...artifact,
      entryId: entry.id,
    }))
    serverDispose.mockRejectedValue(new Error('Output owner disposal failed'))
    expect(await run()).toMatchObject({ status: 'failed', unsafeCleanup: true })
    expect(createServer).toHaveBeenCalledTimes(1)
    expect(executeFile).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('publishes browser success only after both parent disposals', async () => {
    useBrowserProject()
    const events: ResultEvent[] = []
    const assertNoFileEnd = () => {
      expect(events.some((event) => event.type === 'file-end')).toBe(false)
    }
    browserDispose.mockImplementation(async () => assertNoFileEnd())
    serverDispose.mockImplementation(async () => {
      expect(browserDispose).toHaveBeenCalledTimes(1)
      assertNoFileEnd()
    })
    const summary = await run(undefined, undefined, (event) =>
      events.push(event)
    )
    expect(summary.files.passed).toBe(1)
    expect(
      events.filter(
        (event) => event.type === 'file-end' && event.status === 'passed'
      )
    ).toHaveLength(1)
  })

  it.each(['missing', 'duplicate', 'failed'] as const)(
    'preserves a failed browser file for %s worker terminal events',
    async (terminal) => {
      useBrowserProject()
      executeFile.mockImplementation(async (input, options) => {
        const envelope = {
          version: 1 as const,
          runId: options.runId,
          timestamp: Date.now(),
        }
        options.onEvent({
          ...envelope,
          type: 'file-start',
          entry: options.entry,
        })
        const result = {
          entryId: input.entryId,
          status:
            terminal === 'failed' ? ('failed' as const) : ('passed' as const),
          durationMs: 1,
        }
        if (terminal !== 'missing')
          options.onEvent({ ...envelope, type: 'file-end', ...result })
        if (terminal === 'duplicate')
          options.onEvent({ ...envelope, type: 'file-end', ...result })
        return result
      })
      const write = jest.fn()
      const events: ResultEvent[] = []
      const summary = await run(undefined, write, (event) => events.push(event))
      expect(summary.status).toBe('failed')
      expect(summary.files.failed).toBe(1)
      expect(summary.files.passed).toBe(0)
      expect(
        events.filter(
          (event) => event.type === 'file-end' && event.status === 'failed'
        )
      ).toHaveLength(1)
      expect(serverDispose).toHaveBeenCalledTimes(1)
    }
  )

  it('seals one failed owning file after parent cleanup while retaining passed cases', async () => {
    useBrowserProject()
    executeFile.mockImplementation(async (input, options) => {
      const envelope = {
        version: 1 as const,
        runId: options.runId,
        timestamp: Date.now(),
      }
      options.onEvent({
        ...envelope,
        type: 'file-start',
        entry: options.entry,
        revision: input.revision,
      })
      options.onEvent({
        ...envelope,
        type: 'case-end',
        entryId: input.entryId,
        caseId: 'passed-case',
        attempt: { id: 'attempt-0', retry: 0, repeat: 0 },
        name: 'passed browser case',
        status: 'passed',
        durationMs: 1,
        errors: [],
      })
      const result = {
        entryId: input.entryId,
        status: 'passed' as const,
        durationMs: 1,
      }
      options.onEvent({ ...envelope, type: 'file-end', ...result })
      return result
    })
    serverDispose.mockRejectedValue(new Error('Parent server cleanup failed'))
    const write = jest.fn()
    const events: ResultEvent[] = []
    const summary = await run(undefined, write, (event) => events.push(event))
    expect(summary.status).toBe('failed')
    expect(summary.files).toEqual({
      passed: 0,
      failed: 1,
      skipped: 0,
      cancelled: 0,
    })
    expect(summary.cases.passed).toBe(1)
    expect(summary.attempts.passed).toBe(1)
    const endings = events.filter((event) => event.type === 'file-end')
    expect(endings).toHaveLength(1)
    expect(endings[0].status).toBe('failed')
    const failure = events.findIndex(
      (event) =>
        event.type === 'diagnostic' &&
        event.diagnostic.message === 'Parent server cleanup failed'
    )
    expect(failure).toBeGreaterThan(-1)
    expect(failure).toBeLessThan(events.indexOf(endings[0]))
    expect(browserDispose).toHaveBeenCalledTimes(1)
    expect(serverDispose).toHaveBeenCalledTimes(1)
  })

  it('stops after partial server acquisition with failed cleanup and retains both errors and logs', async () => {
    useBrowserProject()
    project.entries.push({
      ...project.entries[0],
      id: 'browser:second.spec.ts',
      file: '/application/second.spec.ts',
    })
    compile.mockImplementation(async (entry) => ({
      ...artifact,
      entryId: entry.id,
    }))
    createServer.mockRejectedValue(
      new ApplicationServerError(
        [
          new Error('Startup failed'),
          new Error('Partial server cleanup failed'),
        ],
        [
          {
            name: 'Startup log',
            kind: 'file',
            path: '/owned/startup.log',
            contentType: 'text/plain',
          },
        ]
      )
    )
    const write = jest.fn()
    const summary = await run(undefined, write)
    expect(summary.status).toBe('failed')
    expect(summary.files.failed).toBe(1)
    expect(summary.attachments).toBe(1)
    expect(write.mock.calls.flat().join('')).toContain('Startup failed')
    expect(write.mock.calls.flat().join('')).toContain(
      'Partial server cleanup failed'
    )
    expect(createServer).toHaveBeenCalledTimes(1)
    expect(createBrowser).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it.each(['errors getter', 'array method', 'cycle', 'deep aggregate'])(
    'preserves failures during cancellation with hostile %s',
    async (kind) => {
      const controller = new AbortController()
      const failure = new Error('Original execution failure')
      if (kind === 'errors getter') {
        Object.defineProperty(failure, 'errors', {
          get() {
            throw new Error('Classification getter trap')
          },
        })
      } else if (kind === 'array method') {
        const errors = [new Error('Original child failure')]
        Object.defineProperty(errors, 'every', {
          get() {
            throw new Error('Classification array trap')
          },
        })
        Object.defineProperty(failure, 'errors', { value: errors })
      } else if (kind === 'cycle') {
        Object.defineProperty(failure, 'errors', { value: [failure] })
      } else {
        let nested: unknown = failure
        for (let index = 0; index < 200; index++) nested = { errors: [nested] }
        Object.defineProperty(failure, 'errors', { value: [nested] })
      }
      executeFile.mockImplementation(async () => {
        controller.abort()
        throw failure
      })
      const write = jest.fn()
      expect((await run(controller.signal, write)).status).toBe('failed')
      expect(write.mock.calls.flat().join('')).toContain(
        'Original execution failure'
      )
      expect(write.mock.calls.flat().join('')).not.toContain(
        'Classification getter trap'
      )
      expect(write.mock.calls.flat().join('')).not.toContain(
        'Classification array trap'
      )
      expect(dispose).toHaveBeenCalledTimes(1)
    }
  )
})
