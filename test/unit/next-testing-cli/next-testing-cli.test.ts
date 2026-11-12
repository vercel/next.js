import { requestCompilerTransform } from 'next/dist/experimental/testing/compiler/transform-broker'
import { createHash } from 'crypto'
import { getDefineEnv } from 'next/dist/build/define-env'
import { usesInSourceTestMarker } from 'next/dist/experimental/testing/in-source'
import loadConfig from 'next/dist/server/config'
import { PHASE_PRODUCTION_BUILD } from 'next/dist/shared/lib/constants'
import {
  configDefaults,
  coverageConfigDefaults,
  defaultInclude,
  defaultExclude,
  defaultBrowserPort,
  defineConfig,
  defineProject,
  mergeConfig,
} from 'next/dist/experimental/testing/config-api'
import { retry } from 'next-test-utils'
import { runNodeHelper } from '../../lib/next-testing-node-helpers'
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
  openTestConfiguration,
  normalizeTestConfig,
  applyTestConfigOverrides,
} from 'next/dist/experimental/testing/config'
import { discoverTests } from 'next/dist/experimental/testing/discovery'
import { collectStaticTestCases } from 'next/dist/experimental/testing/static-collection'
import {
  parseMaxWorkers,
  parseTestShard,
  shardTestProjects,
  forEachTestFile,
} from 'next/dist/experimental/testing/scheduling'
import * as capabilities from 'next/dist/experimental/testing/capabilities'
import { runTests } from 'next/dist/experimental/testing/orchestrator'
import { watchTests } from 'next/dist/experimental/testing/watch-orchestrator'
import { watchTestFiles } from 'next/dist/experimental/testing/incremental/watch-files'
import { runWatchProcess } from 'next/dist/experimental/testing/watch-process'
import { createTestCompilerSession } from 'next/dist/experimental/testing/compiler'
import { execute } from 'next/dist/experimental/testing/execution/execute'
import type {
  CompiledTestArtifact,
  ExecuteTestOptions,
  TestEntry,
} from 'next/dist/experimental/testing/contracts'
import type { DiscoveredTestProject } from 'next/dist/experimental/testing/discovery'
import type { ResultEvent } from 'next/dist/experimental/testing/reporting/events'

jest.mock('next/dist/experimental/testing/capabilities', () => ({
  ...jest.requireActual('next/dist/experimental/testing/capabilities'),
  requireTestCapability: jest.fn(
    jest.requireActual('next/dist/experimental/testing/capabilities')
      .requireTestCapability
  ),
}))

jest.mock('next/dist/experimental/testing/scheduling', () => ({
  ...jest.requireActual('next/dist/experimental/testing/scheduling'),
  acquireTestRunLock: async () => ({ unlock: async () => {} }),
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
jest.mock('next/dist/experimental/testing/assertions/snapshots', () => ({
  ...jest.requireActual('next/dist/experimental/testing/assertions/snapshots'),
  commitSnapshotUpdates: jest.fn(),
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

describe('interactive watch keyboard ownership', () => {
  let previousCI: string | undefined
  let previousTerm: string | undefined
  beforeEach(() => {
    previousCI = process.env.CI
    previousTerm = process.env.TERM
    delete process.env.CI
    delete process.env.TERM
  })
  afterEach(() => {
    if (previousCI === undefined) delete process.env.CI
    else process.env.CI = previousCI
    if (previousTerm === undefined) delete process.env.TERM
    else process.env.TERM = previousTerm
  })
  function terminal() {
    const { PassThrough } = require('stream') as typeof import('stream')
    const input = new PassThrough() as unknown as NodeJS.ReadStream
    Object.assign(input, {
      isTTY: true,
      isRaw: false,
      setRawMode: jest.fn((raw: boolean) => {
        input.isRaw = raw
        return input
      }),
    })
    input.pause()
    const output = {
      isTTY: true,
      write: jest.fn(),
    } as unknown as NodeJS.WriteStream
    return { input, output }
  }

  it('dispatches shortcuts and validated prompts, cancels busy runs, and restores input', () => {
    const { createWatchKeyboard } =
      require('next/dist/experimental/testing/incremental/watch-keyboard') as typeof import('next/dist/experimental/testing/incremental/watch-keyboard')
    const { input, output } = terminal()
    const onCommand = jest.fn()
    const onError = jest.fn()
    const onPromptChange = jest.fn()
    const priorListener = jest.fn()
    input.on('data', priorListener)
    input.pause()
    let busy = false
    const keyboard = createWatchKeyboard({
      input,
      output,
      onCommand,
      onError,
      onPromptChange,
      isRunning: () => busy,
    })
    input.emit('data', Buffer.from('rfau\r'))
    expect(onCommand.mock.calls.map(([command]) => command.type)).toEqual([
      'rerun',
      'failed',
      'all',
      'update',
      'all',
    ])
    input.emit('data', Buffer.from('pmath\r'))
    input.emit('data', Buffer.from('t[\r^works$\r'))
    expect(onCommand).toHaveBeenCalledWith({ type: 'files', value: 'math' })
    expect(onCommand).toHaveBeenCalledWith({ type: 'name', value: '^works$' })
    input.emit('data', Buffer.from('wignored\x03'))
    expect(onCommand).not.toHaveBeenCalledWith({
      type: 'project',
      value: 'ignored',
    })
    busy = true
    input.emit('data', Buffer.from('q'))
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'cancel' })
    input.emit('data', Buffer.from('\x03'))
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'interrupt' })
    keyboard.close()
    keyboard.close()
    expect(input.isRaw).toBe(false)
    expect(input.readableFlowing).toBe(false)
    expect(input.listeners('data')).toEqual([priorListener])
    expect(input.listenerCount('error')).toBe(0)
    expect(onPromptChange.mock.calls).toEqual([
      [true],
      [false],
      [true],
      [false],
      [true],
      [false],
    ])
    expect(onError).not.toHaveBeenCalled()
  })

  it('distinguishes split arrow keys from escape and releases prompt ownership', () => {
    jest.useFakeTimers()
    const { createWatchKeyboard } =
      require('next/dist/experimental/testing/incremental/watch-keyboard') as typeof import('next/dist/experimental/testing/incremental/watch-keyboard')
    const { input, output } = terminal()
    const onCommand = jest.fn()
    const onPromptChange = jest.fn()
    const keyboard = createWatchKeyboard({
      input,
      output,
      onCommand,
      onPromptChange,
      onError: jest.fn(),
    })
    try {
      input.emit('data', Buffer.from('\x1b'))
      input.emit('data', Buffer.from('[A'))
      jest.advanceTimersByTime(30)
      expect(onCommand).not.toHaveBeenCalled()
      input.emit('data', Buffer.from('pignored\x1b'))
      jest.advanceTimersByTime(30)
      expect(onPromptChange.mock.calls).toEqual([[true], [false]])
      expect(onCommand).not.toHaveBeenCalled()
      input.emit('data', Buffer.from('\x1b'))
      jest.advanceTimersByTime(30)
      expect(onCommand).toHaveBeenCalledWith({ type: 'interrupt' })
    } finally {
      keyboard.close()
      jest.useRealTimers()
    }
  })

  it.each(['CI', 'TERM'])(
    'does not capture input with %s disabling interaction',
    (name) => {
      const { createWatchKeyboard } =
        require('next/dist/experimental/testing/incremental/watch-keyboard') as typeof import('next/dist/experimental/testing/incremental/watch-keyboard')
      const { input, output } = terminal()
      process.env[name] = name === 'CI' ? 'true' : 'dumb'
      createWatchKeyboard({
        input,
        output,
        onCommand: jest.fn(),
        onError: jest.fn(),
      }).close()
      expect(input.setRawMode).not.toHaveBeenCalled()
      expect(input.listenerCount('data')).toBe(0)
    }
  )

  it('awaits cancelled run cleanup before a queued generation and stays watching', async () => {
    const { createWatchSession } =
      require('next/dist/experimental/testing/incremental/watch-session') as typeof import('next/dist/experimental/testing/incremental/watch-session')
    let began!: () => void
    const started = new Promise<void>((resolve) => {
      began = resolve
    })
    let release!: () => void
    const cleanup = new Promise<void>((resolve) => {
      release = resolve
    })
    let runs = 0
    const run = jest.fn(async ({ signal }: { signal: AbortSignal }) => {
      if (++runs === 1) {
        began()
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true })
        )
        await cleanup
        return { status: 'cancelled' as const }
      }
      return { status: 'passed' as const }
    })
    const onError = jest.fn()
    const session = createWatchSession({
      discover: async () => ({ entryIds: ['first'], discoveryRevision: '1' }),
      run,
      onError,
    })
    try {
      await started
      session.cancelCurrent()
      session.invalidate()
      session.invalidate()
      await Promise.resolve()
      expect(run).toHaveBeenCalledTimes(1)
      release()
      await session.waitForIdle()
      expect(run).toHaveBeenCalledTimes(2)
      expect(onError).not.toHaveBeenCalled()
      session.invalidate()
      await session.waitForIdle()
      expect(run).toHaveBeenCalledTimes(3)
    } finally {
      release()
      await session.close()
    }
  })

  it('retains failed file selections and applies snapshot write authority to one generation', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-testing-keyboard-generations-')
    )
    const { input, output } = terminal()
    const controller = new AbortController()
    const close = jest.fn().mockResolvedValue(undefined)
    jest
      .mocked(watchTestFiles)
      .mockReset()
      .mockResolvedValue({
        close,
        update: jest.fn().mockResolvedValue(undefined),
      })
    type RunRequest = Extract<
      Parameters<typeof runWatchProcess>[0],
      { operation: 'run' }
    >
    const requests: RunRequest[] = []
    const statuses: string[] = []
    let statusReady: (() => void) | undefined
    const write = (text: string) => {
      if (
        text.includes('Waiting for file changes') ||
        text.includes('Watching for file changes')
      ) {
        statuses.push(text)
        statusReady?.()
      }
    }
    const nextStatus = (count = 1) =>
      new Promise<void>((resolve) => {
        statusReady = () => {
          if (--count === 0) resolve()
        }
      })
    const changed = () =>
      jest.mocked(watchTestFiles).mock.calls[0][0].onChange({
        changed: [path.join(directory, 'first.spec.ts')],
        removed: [],
      })
    jest
      .mocked(runWatchProcess)
      .mockReset()
      .mockImplementation(async (request, runOptions) => {
        if (request.operation === 'metadata')
          return {
            operation: 'metadata',
            directories: { directories: [directory], outputDirectories: [] },
          }
        if (request.operation === 'plan')
          throw new Error('Unexpected planner request in watch control')
        requests.push(request)
        const failed = requests.length === 1
        const envelope = {
          version: 1 as const,
          runId: `mock-${requests.length}`,
          timestamp: Date.now(),
        }
        runOptions.onEvent?.({ ...envelope, type: 'run-start' })
        for (const project of request.projects) {
          for (const entry of project.entries) {
            runOptions.onEvent?.({ ...envelope, type: 'file-start', entry })
            runOptions.onEvent?.({
              version: 1,
              timestamp: Date.now(),
              runId: 'mock',
              type: 'file-end',
              entryId: entry.id,
              status:
                failed && entry.file.endsWith('first.spec.ts')
                  ? 'failed'
                  : 'passed',
              durationMs: 1,
            })
          }
        }
        if (request.updateSnapshots) {
          runOptions.onSnapshotCommitStart?.()
          changed()
          runOptions.onSnapshotCommitEnd?.()
          // Native notifications may arrive after the final transaction callback.
          changed()
          expect(runOptions.signal.aborted).toBe(false)
        }
        const counts = {
          passed: failed ? 1 : 2,
          failed: failed ? 1 : 0,
          skipped: 0,
          cancelled: 0,
        }
        runOptions.onEvent?.({
          ...envelope,
          type: 'run-end',
          status: failed ? 'failed' : 'passed',
          durationMs: 1,
        })
        return {
          operation: 'run',
          result: {
            runId: 'mock',
            unsafeCleanup: false,
            status: failed ? 'failed' : 'passed',
            files: counts,
            cases: counts,
            attempts: counts,
            errors: 0,
            warnings: 0,
            attachments: 0,
          },
        }
      })
    let runningWatch: ReturnType<typeof watchTests> | undefined
    try {
      await writeFile(path.join(directory, 'first.spec.ts'), '')
      await writeFile(path.join(directory, 'second.spec.ts'), '')
      const first = nextStatus()
      runningWatch = watchTests(directory, {
        input,
        output,
        signal: controller.signal,
        write,
      })
      await first
      const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
      await settle()
      async function key(value: string) {
        const status = nextStatus()
        input.emit('data', Buffer.from(value))
        await status
        await settle()
      }
      await key('f')
      expect(
        requests
          .at(-1)!
          .projects.flatMap((project) =>
            project.entries.map((entry) => path.basename(entry.file))
          )
      ).toEqual(['first.spec.ts'])
      const changedStatus = nextStatus()
      changed()
      await changedStatus
      await settle()
      expect(
        requests
          .at(-1)!
          .projects.flatMap((project) =>
            project.entries.map((entry) => path.basename(entry.file))
          )
      ).toEqual(['first.spec.ts'])
      await key('a')
      await key('pfirst\r')
      await key('t^work\r')
      expect(requests.at(-1)!.testNamePattern).toBe('^work')
      expect(
        requests.at(-1)!.projects.flatMap((project) => project.entries)
      ).toHaveLength(1)
      await key('t\r')
      expect(requests.at(-1)!.testNamePattern).toBeUndefined()
      expect(
        requests.at(-1)!.projects.flatMap((project) => project.entries)
      ).toHaveLength(2)
      await key('wmissing-project\r')
      await key('w\r')
      await key('pno-such-file\r')
      await key('p\r')
      const snapshotStatuses = nextStatus(2)
      input.emit('data', Buffer.from('u'))
      await snapshotStatuses
      await settle()
      expect(
        requests.filter((request) => request.updateSnapshots)
      ).toHaveLength(1)
      expect(requests.at(-1)!.updateSnapshots).toBe(false)
      expect(statuses.at(-1)).toMatch(/PASS/)
      input.emit('data', Buffer.from('q'))
      // Pinned Vitest keeps the failed exit history after a repaired PASS run.
      expect(await runningWatch).toEqual({ status: 'failed' })
      expect(close).toHaveBeenCalledTimes(1)
      expect(input.isRaw).toBe(false)
    } finally {
      controller.abort()
      await runningWatch
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not capture piped input and restores raw mode after callback failure', () => {
    const { createWatchKeyboard } =
      require('next/dist/experimental/testing/incremental/watch-keyboard') as typeof import('next/dist/experimental/testing/incremental/watch-keyboard')
    const { input, output } = terminal()
    output.isTTY = false
    createWatchKeyboard({
      input,
      output,
      onCommand: jest.fn(),
      onError: jest.fn(),
    }).close()
    expect(input.setRawMode).not.toHaveBeenCalled()
    output.isTTY = true
    input.isRaw = true
    const failure = new Error('command failed')
    const onError = jest.fn()
    createWatchKeyboard({
      input,
      output,
      onCommand() {
        throw failure
      },
      onError,
    })
    input.emit('data', Buffer.from('r'))
    expect(onError).toHaveBeenCalledWith(failure)
    expect(input.isRaw).toBe(true)
    expect(input.listenerCount('data')).toBe(0)
    expect(input.listenerCount('end')).toBe(0)
  })
})

describe('Pinned configuration helper primitives', () => {
  it('preserves the shallow frozen defaults and shared public array/object identities', () => {
    expect(Object.isFrozen(configDefaults)).toBe(true)
    expect(configDefaults.clearMocks).toBe(true)
    expect(configDefaults.include).toBe(defaultInclude)
    expect(configDefaults.exclude).toBe(defaultExclude)
    expect(configDefaults.coverage).toBe(coverageConfigDefaults)
    expect(defaultInclude).toEqual(['**/*.{test,spec}.?(c|m)[jt]s?(x)'])
    expect(defaultExclude).toEqual(['**/node_modules/**', '**/.git/**'])
    expect(defaultBrowserPort).toBe(63315)
    expect(Object.isFrozen(defaultInclude)).toBe(false)
  })

  it('retains factory identities and rejects callback configuration merging', async () => {
    const factory = async () => ({ test: { name: 'project' } })
    expect(defineConfig(factory)).toBe(factory)
    expect(defineProject(factory)).toBe(factory)
    await expect(
      defineConfig(factory)({ command: 'serve', mode: 'test' })
    ).resolves.toEqual({ test: { name: 'project' } })
    expect(() => mergeConfig(factory as never, {})).toThrow(
      'Cannot merge config in form of callback'
    )
  })

  it('preserves override-first aliases, true externals and non-plain replacement values', () => {
    const replacement = new Date(0)
    const merged = mergeConfig(
      {
        resolve: { alias: [{ find: 'same', replacement: 'old' }] },
        ssr: { noExternal: true },
        nested: { old: true },
      },
      {
        resolve: { alias: [{ find: 'same', replacement: 'new' }] },
        ssr: { noExternal: ['package'] },
        nested: replacement,
      }
    )
    expect(merged).toMatchObject({
      resolve: {
        alias: [
          { find: 'same', replacement: 'new' },
          { find: 'same', replacement: 'old' },
        ],
      },
      ssr: { noExternal: true },
    })
    expect(merged.nested).toBe(replacement)
  })
})

describe('Next-owned in-source test discovery', () => {
  it('discovers marked includeSource entries without evaluating source modules', async () => {
    const directory = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'next-in-source-'))
    )
    try {
      const original = await readFile(
        path.resolve(
          __dirname,
          '../app-dir/next-testing-stable-release-gaps/fixtures/in-source-tests/subject.source.mjs'
        ),
        'utf8'
      )
      await writeFile(path.join(directory, 'subject.source.mjs'), original)
      await writeFile(
        path.join(directory, 'unmarked.source.mjs'),
        "throw new Error('must not evaluate')"
      )
      await writeFile(path.join(directory, 'excluded.source.mjs'), original)
      await writeFile(
        path.join(directory, 'control.case.mjs'),
        "throw new Error('must not evaluate')"
      )
      const config = normalizeTestConfig({
        test: {
          include: ['*.case.mjs'],
          includeSource: ['*.source.mjs'],
          exclude: ['excluded.*'],
        },
      })
      const [project] = await discoverTests(directory, config)
      expect(
        project.entries.map((entry) => ({
          file: path.basename(entry.file),
          inSource: entry.inSource,
        }))
      ).toEqual([
        { file: 'control.case.mjs', inSource: undefined },
        { file: 'subject.source.mjs', inSource: true },
      ])
      expect(
        await readFile(path.join(directory, 'subject.source.mjs'), 'utf8')
      ).toBe(original)
      expect(project.entries[1].inSourceHash).toBe(
        createHash('sha256').update(original).digest('hex')
      )
      const [filtered] = await discoverTests(directory, config, {
        files: ['subject'],
      })
      expect(filtered.entries).toEqual([project.entries[1]])
      const overlap = normalizeTestConfig({
        test: {
          include: ['subject.source.mjs'],
          includeSource: ['subject.source.mjs'],
        },
      })
      expect((await discoverTests(directory, overlap))[0].entries).toHaveLength(
        1
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('requests native marker support for ordinary included specs without includeSource', async () => {
    const directory = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'next-ordinary-marker-'))
    )
    try {
      const source = await readFile(
        path.resolve(
          __dirname,
          '../app-dir/next-testing-stable-release-gaps/fixtures/in-source-tests/subject.source.mjs'
        )
      )
      await writeFile(path.join(directory, 'ordinary.case.mjs'), source)
      const [project] = await discoverTests(
        directory,
        normalizeTestConfig({ test: { include: ['*.case.mjs'] } })
      )
      expect(project.entries).toHaveLength(1)
      expect(project.entries[0].inSource).toBe(true)
      expect(project.entries[0].inSourceHash).toBe(
        createHash('sha256').update(source).digest('hex')
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    'import.meta /* comment */ .vitest',
    'import.meta. vitest',
    'import /* comment */ . meta . vitest',
    'import.meta.\\u0076itest',
  ])(
    'structurally detects the ordinary marker %s without broadening includeSource discovery',
    async (marker) => {
      const directory = await realpath(
        await mkdtemp(path.join(os.tmpdir(), 'next-structural-marker-'))
      )
      try {
        const source = `if (${marker}) { const {test}= ${marker};test('original',()=>{}) }`
        await writeFile(path.join(directory, 'ordinary.case.mjs'), source)
        await writeFile(path.join(directory, 'only.source.mjs'), source)
        const [project] = await discoverTests(
          directory,
          normalizeTestConfig({
            test: { include: ['*.case.mjs'], includeSource: ['*.source.mjs'] },
          })
        )
        expect(project.entries).toHaveLength(1)
        expect(project.entries[0].file).toBe(
          path.join(directory, 'ordinary.case.mjs')
        )
        expect(project.entries[0].inSource).toBe(true)
        expect(project.entries[0].inSourceHash).toBe(
          createHash('sha256').update(source).digest('hex')
        )
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  )

  it.each([
    '(import.meta).vitest',
    '((import.meta)).vitest',
    '(import.meta as any).vitest',
    'import.meta!.vitest',
    'import.meta?.vitest',
  ])('fails closed for unqualified wrapped marker %s', (marker) => {
    expect(() =>
      usesInSourceTestMarker(`if(${marker}){}`, 'ordinary.ts')
    ).toThrow('remains unqualified')
  })
  it('rejects unsupported wrappers even when a supported marker occurs in the same file', () => {
    expect(() =>
      usesInSourceTestMarker(
        'if((import.meta).vitest){};if(import.meta.vitest){}',
        'ordinary.mjs'
      )
    ).toThrow('remains unqualified')
    expect(() =>
      usesInSourceTestMarker(
        'if(import.meta.vitest){};if((import.meta).vitest){}',
        'ordinary.mjs'
      )
    ).toThrow('remains unqualified')
  })

  it('leaves an ordinary computed metadata key named vitest unchanged', () => {
    expect(
      usesInSourceTestMarker(
        `const vitest='url';console.log(import.meta[vitest])`,
        'ordinary.mjs'
      )
    ).toBe(false)
    expect(
      usesInSourceTestMarker(
        `const vitest='url';console.log((import.meta)[vitest])`,
        'ordinary.mjs'
      )
    ).toBe(false)
  })

  it('preserves support for parentheses around the whole direct marker', () => {
    expect(
      usesInSourceTestMarker('if((import.meta.vitest)){}', 'ordinary.mjs')
    ).toBe(true)
  })

  it('ignores marker strings, comments and unrelated meta properties while failing closed on syntax errors', () => {
    expect(
      usesInSourceTestMarker(
        `export const text='import.meta.vitest';/* import.meta.vitest */export const url=import.meta.url`,
        'ordinary.mjs'
      )
    ).toBe(false)
    expect(
      usesInSourceTestMarker(
        `const typed: number=42;if(import.meta /*c*/ .vitest){}`,
        'ordinary.ts'
      )
    ).toBe(true)
    expect(() =>
      usesInSourceTestMarker('if(import.meta. vitest){', 'ordinary.mjs')
    ).toThrow('Cannot determine in-source test marker')
  })

  it('requires Node in-source profiles and validates includeSource while preserving empty settings', () => {
    expect(() =>
      normalizeTestConfig({ test: { includeSource: 'subject.mjs' } })
    ).toThrow('array of nonempty strings')
    expect(() =>
      normalizeTestConfig({
        test: { environment: 'rsc', includeSource: ['*.mjs'] },
      })
    ).toThrow('fresh Node file profile')
    expect(
      normalizeTestConfig({ test: { environment: 'rsc', includeSource: [] } })
        .projects[0].includeSource
    ).toEqual([])
  })

  it.each(['client', 'node', 'edge'])(
    'defines the ordinary %s marker as false before production tracing',
    async (environment) => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'next-define-marker-')
      )
      try {
        const config = await loadConfig(PHASE_PRODUCTION_BUILD, directory)
        const options = {
          isTurbopack: true,
          clientRouterFilters: undefined,
          config,
          dev: false,
          distDir: '.next',
          projectPath: directory,
          fetchCacheKeyPrefix: undefined,
          hasRewrites: false,
          isClient: environment === 'client',
          isNodeServer: environment === 'node',
          isEdgeServer: environment === 'edge',
          middlewareMatchers: undefined,
          rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
        }
        expect(getDefineEnv(options)['import.meta.vitest']).toBe('false')
        expect(
          getDefineEnv({
            ...options,
            config: {
              ...config,
              compiler: { define: { 'import.meta.vitest': false } },
            },
          })['import.meta.vitest']
        ).toBe('false')
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  )
})

describe('real execution environment selection', () => {
  it('keeps DOM execution options separate from the compiler profile', () => {
    for (const name of ['jsdom', 'happy-dom', './environment.mjs']) {
      const [project] = parseTestConfig({
        projects: [
          {
            name: 'realm',
            environment: name,
            environmentOptions: { option: 42 },
          },
        ],
      }).projects
      expect(project.profile.environment).toBe('node')
      expect(project.executionEnvironment).toEqual({
        name,
        options: { option: 42 },
      })
    }
    expect(() =>
      parseTestConfig({
        projects: [
          {
            name: 'realm',
            environment: 'jsdom',
            environmentOptions: { callback() {} },
          },
        ],
      })
    ).toThrow('serializable')
  })

  it('resolves leading file pragmas before compilation without evaluating typecheck entries', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'next-environment-discovery-')
    )
    try {
      await writeFile(
        path.join(root, 'dom.test.ts'),
        '// @vitest-environment jsdom\n// @vitest-environment-options {"url":"https://file.example/"}\nthrow new Error("never evaluated")'
      )
      await writeFile(
        path.join(root, 'node.test.ts'),
        'const text = "@vitest-environment happy-dom"'
      )
      await writeFile(
        path.join(root, 'compile.test-d.ts'),
        '// @vitest-environment invalid-realm\nthrow new Error("typecheck is never evaluated")'
      )
      const [project] = await discoverTests(
        root,
        parseTestConfig({
          projects: [{ name: 'realm', typecheck: { enabled: true } }],
        })
      )
      const dom = project.entries.find((entry) =>
        entry.file.endsWith('dom.test.ts')
      )!
      expect(dom.profile.environment).toBe('node')
      expect(dom.executionEnvironment).toEqual({
        name: 'jsdom',
        options: { jsdom: { url: 'https://file.example/' } },
      })
      expect(dom.environmentSourceHash).toMatch(/^[a-f0-9]{64}$/)
      expect(
        project.entries.find((entry) => entry.file.endsWith('node.test.ts'))!
          .executionEnvironment
      ).toBeUndefined()
      const typecheck = project.entries.find((entry) => entry.typecheck)!
      expect(typecheck.executionEnvironment).toBeUndefined()
      expect(typecheck.environmentSourceHash).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('owned read-only editor discovery API', () => {
  it('accepts explicit decimal ports and an actual ephemeral port', async () => {
    const { parseEditorApiPort } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    expect(parseEditorApiPort(true)).toBe(51204)
    expect(parseEditorApiPort('0')).toBe(0)
    expect(parseEditorApiPort('65535')).toBe(65535)
    for (const value of ['', '-1', '65536', '1.5', '0x10', ' 1', '01'])
      expect(() => parseEditorApiPort(value)).toThrow('decimal port')
  })

  it('serves selected files and real observed identities, rejects writes and foreign origins, and closes owned sockets', async () => {
    const { openTestDiscoveryApi } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    const { request } = await import('node:http')
    const entry = {
      id: 'project:case',
      file: '/selected/contract.case.mjs',
      profile: {
        id: 'project',
        environment: 'node' as const,
        mode: 'development' as const,
        runtime: 'nodejs' as const,
        bundler: 'turbopack' as const,
      },
    }
    const api = await openTestDiscoveryApi('/selected', [entry], 0)
    async function read(
      options: {
        method?: string
        headers?: Record<string, string>
        path?: string
      } = {}
    ) {
      return new Promise<{ code: number; text: string; headers: object }>(
        (resolve, reject) => {
          const outgoing = request(api.url, options, (response) => {
            let text = ''
            response.setEncoding('utf8')
            response.on('data', (chunk) => {
              text += chunk
            })
            response.once('end', () =>
              resolve({
                code: response.statusCode!,
                text,
                headers: response.headers,
              })
            )
            response.once('error', reject)
          })
          outgoing.once('error', reject)
          outgoing.end()
        }
      )
    }
    const envelope = {
      version: 1 as const,
      runId: 'actual-parent-run',
      timestamp: 1,
    }
    try {
      expect(api.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1\/discovery$/)
      const initial = await read()
      expect(initial.code).toBe(200)
      expect(JSON.parse(initial.text)).toMatchObject({
        version: 1,
        protocol: 'next-test-discovery',
        observedCasesOnly: true,
        run: null,
        cases: [],
        files: [
          { id: entry.id, file: 'contract.case.mjs', project: 'project' },
        ],
      })
      api.onEvent({ ...envelope, type: 'run-start' })
      const attempt = { id: 'native-attempt', retry: 0, repeat: 0 }
      api.onEvent({
        ...envelope,
        type: 'case-start',
        entryId: entry.id,
        caseId: 'native-case',
        name: 'suite original body',
        testName: 'original body',
        ancestors: [{ id: 'native-suite', name: 'suite' }],
        attempt,
      })
      attempt.retry = 42
      expect(JSON.parse((await read()).text)).toMatchObject({
        run: { id: envelope.runId, status: 'running' },
        cases: [
          {
            entryId: entry.id,
            caseId: 'native-case',
            name: 'suite original body',
            testName: 'original body',
            ancestors: ['suite'],
            status: 'running',
            attempt: { retry: 0 },
          },
        ],
      })
      expect((await read({ method: 'HEAD' })).text).toBe('')
      expect((await read({ method: 'POST' })).code).toBe(405)
      expect(
        (await read({ headers: { origin: 'https://foreign.invalid' } })).code
      ).toBe(403)
      expect((await read({ headers: { host: 'foreign.invalid' } })).code).toBe(
        403
      )
      expect((await read({ path: '/v1/run' })).code).toBe(404)
      expect(() =>
        api.onEvent({
          ...envelope,
          runId: 'foreign',
          type: 'run-end',
          status: 'passed',
          durationMs: 0,
        })
      ).toThrow('foreign run')
      expect(() =>
        api.onEvent({
          ...envelope,
          type: 'case-start',
          entryId: 'foreign-file',
          caseId: 'foreign-case',
          name: 'foreign',
          attempt,
        })
      ).toThrow('unselected file')
      api.onEvent({
        ...envelope,
        type: 'run-end',
        status: 'passed',
        durationMs: 1,
      })
      expect(JSON.parse((await read()).text).run.status).toBe('passed')
    } finally {
      await api.dispose()
    }
    await expect(api.dispose()).resolves.toBeUndefined()
    await expect(read()).rejects.toThrow()
    expect(() =>
      api.onEvent({
        ...envelope,
        type: 'run-end',
        status: 'passed',
        durationMs: 0,
      })
    ).toThrow('closed')
    await expect(
      openTestDiscoveryApi(
        '/selected',
        [{ ...entry, file: '/foreign/file' }],
        0
      )
    ).rejects.toThrow('outside')
    await expect(
      openTestDiscoveryApi('/selected', [entry, entry], 0)
    ).rejects.toThrow('unique')
  })
})

describe('ordinary development Node project environment', () => {
  it('normalizes configured values without changing host environment or excluding similarly prefixed runtime keys', () => {
    const before = process.env.NODE_CUSTOM_ENV
    const config = normalizeTestConfig({
      test: {
        env: { ROOT: 'root', NODE_CUSTOM_ENV: 'node', __CUSTOM_ENV: 'custom' },
        projects: [
          { test: { name: 'ordinary', env: { ROOT: 'child', EMPTY: '' } } },
        ],
      },
    })
    expect(config.projects[0].env).toEqual({
      ROOT: 'child',
      NODE_CUSTOM_ENV: 'node',
      __CUSTOM_ENV: 'custom',
      EMPTY: '',
    })
    expect(process.env.NODE_CUSTOM_ENV).toBe(before)
    expect(() =>
      parseTestConfig({ projects: [{ name: 'invalid', env: { VALUE: 1 } }] })
    ).toThrow('env.VALUE must be a string')
    expect(() =>
      parseTestConfig({
        projects: [{ name: 'invalid', env: { NODE_ENV: 'custom' } }],
      })
    ).toThrow('compiler-owned Node mode')
  })

  it.each([
    { environment: 'rsc' },
    { environment: 'jsdom' },
    { route: '/route' },
    { isolate: false },
  ])(
    'keeps the unqualified Node env execution profile explicit: %j',
    (profile) => {
      expect(() =>
        parseTestConfig({
          projects: [{ name: 'invalid', ...profile, env: { VALUE: 'value' } }],
        })
      ).toThrow(
        'env currently requires an isolated ordinary Node or Browser client project'
      )
    }
  )
})

describe('Browser env configuration forwarding', () => {
  it('inherits string env values for Browser clients and rejects unimplemented inputs', () => {
    const config = normalizeTestConfig({
      test: {
        browser: { enabled: true },
        env: { ROOT: 'root', OVERRIDE: 'root' },
        projects: [
          {
            name: 'browser-env',
            env: { OVERRIDE: 'project', CHILD: 'child' },
            unstubEnvs: true,
          },
        ],
      },
    })
    expect(config.projects[0].env).toEqual({
      ROOT: 'root',
      OVERRIDE: 'project',
      CHILD: 'child',
    })
    expect(config.projects[0].unstubEnvs).toBe(true)
    expect(() =>
      normalizeTestConfig({
        test: { browser: { enabled: true }, env: { BAD: 1 } },
      })
    ).toThrow('env.BAD must be a string')
    expect(
      parseTestConfig({ projects: [{ name: 'node', env: { KEY: 'value' } }] })
        .projects[0].env
    ).toEqual({ KEY: 'value' })
  })

  it('forwards exact env and reset settings to ordinary and watch-broker file execution', async () => {
    const config = normalizeTestConfig({
      test: {
        browser: { enabled: true },
        env: { NEXT_ENV_FORWARD: 'value' },
        unstubEnvs: true,
      },
    }).projects[0]
    const project: DiscoveredTestProject = {
      ...config,
      entries: [
        {
          id: 'env-entry',
          file: '/application/env.case.mjs',
          profile: config.profile,
        },
      ],
    }
    const artifact: any = {
      version: 2,
      kind: 'browser',
      entryId: 'env-entry',
      profile: config.profile,
      revision: 'env-revision',
      diagnostics: [],
      client: { sourceFile: project.entries[0].file },
    }
    const session = {
      compile: jest.fn(async () => artifact),
      dispose: jest.fn(async () => {}),
      shutdownCompilation: jest.fn(async () => {}),
    }
    const calls: ExecuteTestOptions[] = []
    const executor = async (input: any, options: ExecuteTestOptions) => {
      calls.push(options)
      options.onEvent({
        version: 1,
        runId: options.runId,
        timestamp: Date.now(),
        type: 'file-start',
        entry: options.entry,
        revision: input.revision,
      })
      const result = {
        entryId: input.entryId,
        status: 'passed' as const,
        durationMs: 0,
      }
      options.onEvent({
        version: 1,
        runId: options.runId,
        timestamp: Date.now(),
        type: 'file-end',
        ...result,
      })
      return result
    }
    const compiler = jest.mocked(createTestCompilerSession),
      executeMock = jest.mocked(execute)
    const previousCompiler = compiler.getMockImplementation(),
      previousExecute = executeMock.getMockImplementation()
    const capability = jest.mocked(capabilities.requireTestCapability),
      previousCapability = capability.getMockImplementation()
    const previousNodeEnv = process.env.NODE_ENV
    try {
      ;(process.env as any).NODE_ENV = 'development'
      capability.mockImplementation(() => {})
      compiler.mockResolvedValue(session as any)
      executeMock.mockImplementation(executor)
      for (const broker of [false, true]) {
        const summary = await runTests('/application', [project], {
          signal: new AbortController().signal,
          write: () => {},
          ...(broker ? { execute: executor } : {}),
        })
        expect(summary.status).toBe('passed')
      }
      expect(calls).toHaveLength(2)
      for (const actual of calls) {
        expect(actual.env).toBe(project.env)
        expect(actual.unstubEnvs).toBe(true)
      }
      expect(session.dispose).toHaveBeenCalledTimes(2)
    } finally {
      compiler.mockImplementation(previousCompiler!)
      executeMock.mockImplementation(previousExecute!)
      capability.mockImplementation(previousCapability!)
      if (previousNodeEnv === undefined) delete (process.env as any).NODE_ENV
      else (process.env as any).NODE_ENV = previousNodeEnv
    }
  })
})

describe('Browser client viewport configuration', () => {
  it('normalizes pinned defaults and partial dimensions without changing app drivers', () => {
    const viewport = (value: unknown) =>
      normalizeTestConfig({
        test: { browser: { enabled: true, viewport: value } },
      }).projects[0].browserViewport
    expect(viewport(undefined)).toEqual({ width: 414, height: 896 })
    expect(viewport(null)).toEqual({ width: 414, height: 896 })
    expect(viewport({ width: 777 })).toEqual({ width: 777, height: 896 })
    expect(viewport({ height: 480 })).toEqual({ width: 414, height: 480 })
    expect(viewport({ width: 0, height: 0 })).toEqual({ width: 0, height: 0 })
    expect(
      normalizeTestConfig({
        test: {
          browser: { enabled: true, viewport: { width: 640, height: 480 } },
          projects: [{ name: 'inherited' }],
        },
      }).projects[0].browserViewport
    ).toEqual({ width: 640, height: 480 })
    expect(
      parseTestConfig({
        projects: [{ name: 'driver', environment: 'browser' }],
      }).projects[0].browserViewport
    ).toBeUndefined()
    for (const value of [-1, 1.5, Infinity, NaN, '640', true]) {
      expect(() => viewport({ width: value })).toThrow(
        'browser.viewport.width must be a non-negative integer'
      )
      expect(() => viewport({ height: value })).toThrow(
        'browser.viewport.height must be a non-negative integer'
      )
    }
    expect(() => viewport({ unknown: 1 })).toThrow('browser.viewport.unknown')
  })
  it('forwards resolved viewport settings to ordinary and watch-broker file execution', async () => {
    const config = normalizeTestConfig({
      test: {
        browser: { enabled: true, viewport: { width: 640, height: 480 } },
      },
    }).projects[0]
    const project: DiscoveredTestProject = {
      ...config,
      entries: [
        {
          id: 'env-entry',
          file: '/application/env.case.mjs',
          profile: config.profile,
        },
      ],
    }
    const artifact: any = {
      version: 2,
      kind: 'browser',
      entryId: 'env-entry',
      profile: config.profile,
      revision: 'env-revision',
      diagnostics: [],
      client: { sourceFile: project.entries[0].file },
    }
    const session = {
      compile: jest.fn(async () => artifact),
      dispose: jest.fn(async () => {}),
      shutdownCompilation: jest.fn(async () => {}),
    }
    const calls: ExecuteTestOptions[] = []
    const executor = async (input: any, options: ExecuteTestOptions) => {
      calls.push(options)
      options.onEvent({
        version: 1,
        runId: options.runId,
        timestamp: Date.now(),
        type: 'file-start',
        entry: options.entry,
        revision: input.revision,
      })
      const result = {
        entryId: input.entryId,
        status: 'passed' as const,
        durationMs: 0,
      }
      options.onEvent({
        version: 1,
        runId: options.runId,
        timestamp: Date.now(),
        type: 'file-end',
        ...result,
      })
      return result
    }
    const compiler = jest.mocked(createTestCompilerSession),
      executeMock = jest.mocked(execute)
    const previousCompiler = compiler.getMockImplementation(),
      previousExecute = executeMock.getMockImplementation()
    const capability = jest.mocked(capabilities.requireTestCapability),
      previousCapability = capability.getMockImplementation()
    const previousNodeEnv = process.env.NODE_ENV
    try {
      ;(process.env as any).NODE_ENV = 'development'
      capability.mockImplementation(() => {})
      compiler.mockResolvedValue(session as any)
      executeMock.mockImplementation(executor)
      for (const broker of [false, true]) {
        const summary = await runTests('/application', [project], {
          signal: new AbortController().signal,
          write: () => {},
          ...(broker ? { execute: executor } : {}),
        })
        expect(summary.status).toBe('passed')
      }
      expect(calls).toHaveLength(2)
      for (const actual of calls) {
        expect(actual.browserViewport).toBe(project.browserViewport)
        expect(actual.browserViewport).toEqual({ width: 640, height: 480 })
      }
      expect(session.dispose).toHaveBeenCalledTimes(2)
    } finally {
      compiler.mockImplementation(previousCompiler!)
      executeMock.mockImplementation(previousExecute!)
      capability.mockImplementation(previousCapability!)
      if (previousNodeEnv === undefined) delete (process.env as any).NODE_ENV
      else (process.env as any).NODE_ENV = previousNodeEnv
    }
  })
})

describe('explicit registered browser layout modules', () => {
  it('normalizes the actual layout file and excludes both registered inputs from test discovery', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-fixture-layout-')
    )
    try {
      await cp(path.join(__dirname, 'registered-layout-fixtures'), directory, {
        recursive: true,
      })
      const fixture = {
        id: 'component',
        module: './component.spec.jsx',
        layout: './layout.spec.jsx',
      }
      const config = parseTestConfig({
        projects: [
          {
            name: 'layout',
            environment: 'browser',
            browserFixtures: [fixture],
          },
        ],
      })
      const [project] = await discoverTests(directory, config)
      expect(project.browserFixtures).toEqual([
        {
          ...fixture,
          exportName: 'default',
          module: await realpath(path.join(directory, fixture.module)),
          layout: await realpath(path.join(directory, fixture.layout)),
        },
      ])
      expect(project.entries.map((entry) => path.basename(entry.file))).toEqual(
        ['driver.spec.mjs']
      )
      const [standalone] = await discoverTests(
        directory,
        parseTestConfig({
          projects: [
            {
              name: 'standalone',
              environment: 'browser',
              browserFixtures: [{ id: 'component', module: fixture.module }],
            },
          ],
        })
      )
      expect(standalone.browserFixtures![0]).not.toHaveProperty('layout')
      expect(
        standalone.entries.map((entry) => path.basename(entry.file))
      ).toEqual(['driver.spec.mjs', 'layout.spec.jsx'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('uses the existing real-file boundary for invalid and escaping layout paths', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-fixture-layout-path-')
    )
    const outside = await mkdtemp(
      path.join(os.tmpdir(), 'next-fixture-layout-outside-')
    )
    try {
      await cp(path.join(__dirname, 'registered-layout-fixtures'), directory, {
        recursive: true,
      })
      const config = (layout: unknown) =>
        parseTestConfig({
          projects: [
            {
              name: 'layout',
              environment: 'browser',
              browserFixtures: [
                { id: 'component', module: './component.spec.jsx', layout },
              ],
            },
          ],
        })
      for (const layout of ['', null, 1])
        expect(() => config(layout)).toThrow('layout must be a nonempty path')
      await mkdir(path.join(directory, 'folder'))
      await expect(
        discoverTests(directory, config('./folder'))
      ).rejects.toThrow('fixture layout is not a file')
      await writeFile(
        path.join(outside, 'layout.jsx'),
        'export default function Layout() { return null }'
      )
      await symlink(
        path.join(outside, 'layout.jsx'),
        path.join(directory, 'linked-layout.jsx')
      )
      await expect(
        discoverTests(directory, config('./linked-layout.jsx'))
      ).rejects.toThrow('fixture layout must be inside the project')
    } finally {
      await rm(directory, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

describe('production Browser client profile selection', () => {
  it('keeps production client mode and its viewport distinct from production app drivers', () => {
    const client = normalizeTestConfig({
      test: { browser: { enabled: true }, mode: 'production' },
    }).projects[0]
    expect(client.profile).toMatchObject({
      environment: 'browser',
      browserClient: true,
      mode: 'production',
      runtime: 'nodejs',
      bundler: 'turbopack',
    })
    expect(client.browserViewport).toEqual({ width: 414, height: 896 })
    const driver = parseTestConfig({
      projects: [
        { name: 'driver', environment: 'browser', mode: 'production' },
      ],
    }).projects[0]
    expect(driver.profile).toMatchObject({
      environment: 'browser',
      mode: 'production',
    })
    expect(driver.profile.browserClient).toBeUndefined()
    expect(driver.browserViewport).toBeUndefined()
    for (const unsupported of [
      { route: '/page' },
      { isolate: false },
      { includeSource: ['*.ts'] },
    ]) {
      expect(() =>
        normalizeTestConfig({
          test: {
            browser: { enabled: true },
            mode: 'production',
            ...unsupported,
          },
        })
      ).toThrow()
    }
  })
})

describe('percentage worker budgets', () => {
  afterEach(() => jest.restoreAllMocks())

  it.each([
    ['50%', 8],
    ['1%', 1],
    ['0%', 1],
    ['150%', 16],
    [' 25% ', 4],
    ['33.5%', 5],
    ['-20%', 1],
  ])('resolves pinned host-relative worker limit %s', (value, expected) => {
    jest.spyOn(os, 'availableParallelism').mockReturnValue(16)
    expect(parseMaxWorkers(value)).toBe(expected)
    expect(parseTestConfig({ maxWorkers: value }).maxWorkers).toBe(expected)
  })

  it('retains the existing scheduling budget after percentage resolution', () => {
    jest.spyOn(os, 'availableParallelism').mockReturnValue(128)
    expect(parseMaxWorkers('50%')).toBe(64)
    expect(() => parseMaxWorkers('100%')).toThrow('between 1 and 64')
    expect(() => parseMaxWorkers('invalid%')).toThrow('maxWorkers')
  })
})

describe('Next-owned one-shot editor cancellation', () => {
  const envelope = {
    version: 1 as const,
    runId: 'current/run:identity',
    timestamp: 1,
  }
  async function read(url: string, method = 'GET') {
    const { request } = await import('node:http')
    return new Promise<{ code: number; text: string; allow?: string }>(
      (resolve, reject) => {
        const outgoing = request(url, { method, agent: false }, (response) => {
          let text = ''
          response.setEncoding('utf8')
          response.on('data', (chunk) => {
            text += chunk
          })
          response.once('end', () =>
            resolve({
              code: response.statusCode!,
              text,
              allow: response.headers.allow,
            })
          )
          response.once('error', reject)
        })
        outgoing.once('error', reject)
        outgoing.end()
      }
    )
  }
  it('finishes the acknowledged response before cancellation disposes its owned API', async () => {
    const { openTestDiscoveryApi } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    let disposal: Promise<void> | undefined
    let calls = 0
    const api = await openTestDiscoveryApi('/selected', [], 0, {
      cancelRun() {
        calls++
        disposal = api.dispose()
      },
    })
    try {
      expect(JSON.parse((await read(api.url)).text).controls).toEqual({
        cancel: true,
      })
      api.onEvent({ ...envelope, type: 'run-start' })
      const result = await read(
        new URL(
          '/v1/runs/' + encodeURIComponent(envelope.runId) + '/cancel',
          api.url
        ).href,
        'POST'
      )
      expect(result.code).toBe(202)
      expect(JSON.parse(result.text)).toEqual({
        version: 1,
        protocol: 'next-test-control',
        command: 'cancel',
        runId: envelope.runId,
        status: 'accepted',
      })
      expect(calls).toBe(1)
      await disposal
      await expect(read(api.url)).rejects.toThrow()
    } finally {
      await api.dispose()
    }
  })
  it('cancels only its current live run and keeps repeated requests idempotent', async () => {
    const { openTestDiscoveryApi } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    const cancelRun = jest.fn()
    const api = await openTestDiscoveryApi('/selected', [], 0, { cancelRun })
    const target = new URL(
      '/v1/runs/' + encodeURIComponent(envelope.runId) + '/cancel',
      api.url
    ).href
    try {
      expect((await read(target, 'POST')).code).toBe(409)
      api.onEvent({ ...envelope, type: 'run-start' })
      expect(
        (await read(new URL('/v1/runs/foreign/cancel', api.url).href, 'POST'))
          .code
      ).toBe(409)
      expect(
        (await read(new URL('/v1/runs/%invalid/cancel', api.url).href, 'POST'))
          .code
      ).toBe(400)
      expect(await read(target)).toMatchObject({ code: 405, allow: 'POST' })
      expect(cancelRun).not.toHaveBeenCalled()
      expect(JSON.parse((await read(target, 'POST')).text).status).toBe(
        'accepted'
      )
      expect(JSON.parse((await read(target, 'POST')).text).status).toBe(
        'already-requested'
      )
      expect(cancelRun).toHaveBeenCalledTimes(1)
      api.onEvent({
        ...envelope,
        type: 'run-end',
        status: 'cancelled',
        durationMs: 1,
      })
      expect((await read(target, 'POST')).code).toBe(409)
      expect(cancelRun).toHaveBeenCalledTimes(1)
    } finally {
      await api.dispose()
    }
  })
  it('retains read-only discovery for callers that do not provide a control owner', async () => {
    const { openTestDiscoveryApi } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    const api = await openTestDiscoveryApi('/selected', [], 0)
    try {
      api.onEvent({ ...envelope, type: 'run-start' })
      expect(JSON.parse((await read(api.url)).text)).not.toHaveProperty(
        'controls'
      )
      expect(
        (
          await read(
            new URL(
              '/v1/runs/' + encodeURIComponent(envelope.runId) + '/cancel',
              api.url
            ).href,
            'POST'
          )
        ).code
      ).toBe(405)
    } finally {
      await api.dispose()
    }
  })
})

describe('independent Chromium Browser instances', () => {
  const browser = (instances: unknown[]) => ({ enabled: true, instances })

  it.each(['development', 'production'] as const)(
    'retains %s profiles and exact names separately from compiler identities',
    (mode) => {
      const unnamed = normalizeTestConfig({
        test: { mode, browser: browser([{ browser: 'chromium' }]) },
      }).projects
      expect(unnamed.map((project) => project.displayName)).toEqual([
        'chromium',
      ])
      const projects = normalizeTestConfig({
        test: {
          name: 'parent',
          mode,
          browser: {
            ...browser([
              { browser: 'chromium' },
              { browser: 'chromium', name: 'authored / label' },
              { browser: 'chromium', name: '' },
            ]),
            viewport: { width: 640, height: 480 },
          },
        },
      }).projects
      expect(projects.map((project) => project.displayName)).toEqual([
        'parent (chromium)',
        'authored / label',
        '',
      ])
      expect(new Set(projects.map((project) => project.profile.id)).size).toBe(
        3
      )
      for (const project of projects) {
        expect(project.profile).toEqual({
          id: expect.stringMatching(/^browser-instance-\d+$/),
          mode,
          environment: 'browser',
          runtime: 'nodejs',
          bundler: 'turbopack',
          browserClient: true,
        })
        expect(project.browserInstance).toEqual({ parentName: 'parent' })
        expect(project.browserViewport).toEqual({ width: 640, height: 480 })
      }
      expect(projects[0].profile).not.toBe(projects[1].profile)
    }
  )

  it('preserves ordinary identities and rejects duplicate public instance names', () => {
    const projects = parseTestConfig({
      projects: [
        { name: 'browser-instance-0' },
        { name: 'parent', browser: browser([{ browser: 'chromium' }]) },
      ],
    }).projects
    expect(projects.map((project) => project.profile.id)).toEqual([
      'browser-instance-0',
      'browser-instance-1',
    ])
    expect(() =>
      normalizeTestConfig({
        test: {
          browser: browser([
            { browser: 'chromium', name: 'same' },
            { browser: 'chromium', name: 'same' },
          ]),
        },
      })
    ).toThrow('Duplicate project name "same"')
    const legacy = normalizeTestConfig({
      test: { name: 'legacy', browser: { enabled: true } },
    }).projects[0]
    expect(legacy.profile.id).toBe('legacy')
    expect(legacy.browserInstance).toBeUndefined()
  })

  it.each([
    { instances: [] },
    { instances: ['chromium'] },
    { instances: [{ browser: 'invalid-browser' }] },
    { instances: [{ browser: 'unknown-browser' }] },
    { instances: [{ browser: 'chromium', name: 1 }] },
    {
      instances: [
        { browser: 'chromium', viewport: { width: 100, height: 100 } },
      ],
    },
  ])(
    'retains explicit unqualified instance controls for $instances',
    ({ instances }) => {
      expect(() =>
        normalizeTestConfig({ test: { browser: browser(instances) } })
      ).toThrow()
    }
  )

  it('selects public instance names and parent groups, including an empty name', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'next-instances-'))
    try {
      await writeFile(
        path.join(directory, 'view.test.mjs'),
        "test('view',()=>{})"
      )
      const config = normalizeTestConfig({
        test: {
          name: 'parent',
          browser: browser([
            { browser: 'chromium', name: 'first / client' },
            { browser: 'chromium', name: '' },
          ]),
        },
      })
      const all = await discoverTests(directory, config, { project: 'parent' })
      expect(all).toHaveLength(2)
      expect(all.map((project) => project.entries[0].projectName)).toEqual([
        'first / client',
        '',
      ])
      expect(new Set(all.map((project) => project.entries[0].id)).size).toBe(2)
      expect(
        (
          await discoverTests(directory, config, { project: 'first / client' })
        ).map((project) => project.displayName)
      ).toEqual(['first / client'])
      expect(
        (await discoverTests(directory, config, { project: '' })).map(
          (project) => project.displayName
        )
      ).toEqual([''])
      expect(
        (await collectStaticTestCases(all)).cases.map(
          (item) => item.projectName
        )
      ).toEqual(['first / client', ''])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('retains all instances and their actual configuration owner in file projects', async () => {
    const directory = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'next-instance-projects-'))
    )
    try {
      await writeFile(
        path.join(directory, 'next.test.config.mjs'),
        "export default {test:{projects:[{test:{browser:{enabled:true,instances:[{browser:'chromium',name:'inline first'},{browser:'chromium',name:'inline second'}]}}},'./vitest.client.config.mjs']}}"
      )
      await writeFile(
        path.join(directory, 'vitest.client.config.mjs'),
        "export default {plugins:[{name:'instance-owner',transform(code){return code.replace('MARKER','owned')}}],test:{name:'file-parent',browser:{enabled:true,instances:[{browser:'chromium',name:'file first'},{browser:'chromium',name:'file second'}]}}}"
      )
      const owner = await openTestConfiguration(directory)
      try {
        expect(
          owner.config.projects.map((project) => project.displayName)
        ).toEqual([
          'inline first',
          'inline second',
          'file first',
          'file second',
        ])
        expect(
          new Set(owner.config.projects.map((project) => project.profile.id))
            .size
        ).toBe(4)
        expect(owner.watchInputs).toContain(
          path.join(directory, 'vitest.client.config.mjs')
        )
        expect(
          owner.config.projects
            .slice(2)
            .map((project) => project.browserInstance)
        ).toEqual([
          { parentName: 'file-parent' },
          { parentName: 'file-parent' },
        ])
        const descriptors = owner.compilerTransforms(owner.config.projects)
        expect(Object.keys(descriptors)).toEqual(
          owner.config.projects.slice(2).map((project) => project.profile.id)
        )
        for (const project of owner.config.projects.slice(2)) {
          expect(
            (
              await requestCompilerTransform(descriptors[project.profile.id], {
                file: path.join(directory, 'view.mjs'),
                query: '',
                moduleType: 'js',
                code: 'export const value = "MARKER"',
              })
            ).code
          ).toBe('export const value = "owned"')
        }
      } finally {
        await owner.dispose()
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 30000)
})

describe('inactive Browser instances and exact parent labels', () => {
  it.each([
    ['development', '', 'chromium'],
    ['production', '', 'chromium'],
    ['development', 'parent / group α', 'parent / group α (chromium)'],
    ['production', 'parent / group α', 'parent / group α (chromium)'],
  ])(
    'expands %s parent %j with public name %j and a separate compiler identity',
    async (mode, parentName, expectedName) => {
      const config = normalizeTestConfig({
        test: {
          name: parentName,
          mode,
          browser: { enabled: true, instances: [{ browser: 'chromium' }] },
        },
      })
      const project = config.projects[0]
      expect(project.displayName).toBe(expectedName)
      expect(project.browserInstance).toEqual({ parentName })
      expect(project.profile.id).toMatch(/^browser-instance-\d+$/)
      expect(project.profile.mode).toBe(mode)
      expect(
        parseTestConfig({
          projects: [
            {
              name: parentName,
              mode,
              browser: { enabled: true, instances: [{ browser: 'chromium' }] },
            },
          ],
        }).projects[0].displayName
      ).toBe(expectedName)
      const directory = await realpath(
        await mkdtemp(path.join(os.tmpdir(), 'next-parent-label-'))
      )
      try {
        await writeFile(
          path.join(directory, 'view.test.mjs'),
          "test('view',()=>{})"
        )
        const selected = await discoverTests(directory, config, {
          project: parentName,
        })
        expect(selected.map((item) => item.entries[0].projectName)).toEqual([
          expectedName,
        ])
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  )

  it.each(['development', 'production'] as const)(
    'keeps disabled instances in their ordinary %s Node profile',
    (mode) => {
      const projects = normalizeTestConfig({
        test: {
          name: 'base-project',
          mode,
          browser: {
            enabled: false,
            instances: [{ browser: 'chromium', name: 'inactive-child' }],
          },
        },
      }).projects
      expect(projects).toHaveLength(1)
      expect(projects[0].profile).toEqual({
        id: 'base-project',
        environment: 'node',
        mode,
        runtime: 'nodejs',
        bundler: 'turbopack',
      })
      expect(projects[0].displayName).toBe('base-project')
      expect(projects[0].browserInstance).toBeUndefined()
      expect(projects[0].browserViewport).toBeUndefined()
    }
  )

  it.each(['node', 'browser', 'rsc'])(
    'preserves an explicit %s environment with inactive instances',
    (environment) => {
      expect(
        normalizeTestConfig({
          test: {
            name: 'explicit',
            environment,
            browser: { enabled: false, instances: [{ browser: 'chromium' }] },
          },
        }).projects[0].profile
      ).toEqual({
        id: 'explicit',
        environment,
        mode: 'development',
        runtime: 'nodejs',
        bundler: 'turbopack',
      })
    }
  )

  it('retains the existing compiler identity grammar for profiles that do not expand', () => {
    for (const name of ['', 'parent / group α']) {
      for (const browser of [
        undefined,
        { enabled: true },
        { enabled: false, instances: [{ browser: 'chromium' }] },
      ]) {
        expect(() =>
          normalizeTestConfig({
            test: { name, ...(browser ? { browser } : {}) },
          })
        ).toThrow('name must contain only letters')
      }
    }
    expect(() =>
      normalizeTestConfig({
        test: {
          name: 1,
          browser: { enabled: true, instances: [{ browser: 'chromium' }] },
        },
      })
    ).toThrow('name must contain only letters')
  })
})

describe('owned watch editor generations', () => {
  it('acknowledges reruns once, resets cancellation ownership and retains actual run and file identities', async () => {
    const { openTestDiscoveryApi } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    const entry: TestEntry = {
      id: 'watch:actual',
      file: '/selected/actual.test.mjs',
      profile: {
        id: 'watch',
        environment: 'node',
        mode: 'development',
        runtime: 'nodejs',
        bundler: 'turbopack',
      },
    }
    const cancelRun = jest.fn()
    const rerun = jest.fn()
    const api = await openTestDiscoveryApi('/selected', [entry], 0, {
      cancelRun,
      rerun,
    })
    const envelope = {
      version: 1 as const,
      runId: 'first/actual',
      timestamp: 1,
    }
    const command = (id: string, action: string, method = 'POST') =>
      fetch(
        new URL('/v1/runs/' + encodeURIComponent(id) + '/' + action, api.url),
        { method }
      )
    try {
      expect((await (await fetch(api.url)).json()).controls).toEqual({
        cancel: true,
        rerun: true,
      })
      api.prepareRun([entry])
      api.onEvent({ ...envelope, type: 'run-start' })
      expect((await command(envelope.runId, 'rerun')).status).toBe(409)
      expect((await command(envelope.runId, 'cancel')).status).toBe(202)
      expect((await command(envelope.runId, 'cancel')).status).toBe(202)
      expect(cancelRun).toHaveBeenCalledTimes(1)
      expect(() => api.prepareRun([entry])).toThrow('not settled')
      api.cancelledRunSettled()
      expect((await (await fetch(api.url)).json()).run.status).toBe('cancelled')
      const accepted = await command(envelope.runId, 'rerun')
      expect(accepted.status).toBe(202)
      expect(await accepted.json()).toMatchObject({
        command: 'rerun',
        runId: envelope.runId,
        status: 'accepted',
      })
      expect(
        await (await command(envelope.runId, 'rerun')).json()
      ).toMatchObject({ status: 'already-requested' })
      expect(rerun).toHaveBeenCalledTimes(1)
      expect((await command(envelope.runId, 'rerun', 'GET')).status).toBe(405)
      api.prepareRun([
        {
          ...entry,
          id: 'watch:replacement',
          file: '/selected/replacement.test.mjs',
        },
      ])
      api.onEvent({ ...envelope, runId: 'second/actual', type: 'run-start' })
      expect((await command(envelope.runId, 'cancel')).status).toBe(409)
      expect((await command(envelope.runId, 'rerun')).status).toBe(409)
      expect((await command('second/actual', 'cancel')).status).toBe(202)
      expect(cancelRun).toHaveBeenCalledTimes(2)
      expect(await (await fetch(api.url)).json()).toMatchObject({
        run: { id: 'second/actual', status: 'running' },
        files: [{ id: 'watch:replacement', file: 'replacement.test.mjs' }],
        cases: [],
      })
      api.cancelledRunSettled()
      expect(() =>
        api.prepareRun([{ ...entry, file: '/foreign/file' }])
      ).toThrow('outside')
      expect((await (await fetch(api.url)).json()).files[0].id).toBe(
        'watch:replacement'
      )
    } finally {
      await api.dispose()
    }
  })
})

describe('retained JSON global setup watch ownership', () => {
  let directory: string
  let trace: string
  beforeEach(async () => {
    directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-global-setup-watch-')
    )
    trace = path.join(directory, 'trace.jsonl')
    await writeFile(trace, '')
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({
        projects: [
          {
            name: 'retained',
            environment: 'node',
            mode: 'development',
            include: ['*.test.mjs'],
            globalSetup: ['./setup.mjs'],
            provide: { configured: 'first' },
          },
        ],
      })
    )
    await writeFile(
      path.join(directory, 'setup.mjs'),
      `import {appendFileSync} from 'node:fs';export default function(project){appendFileSync(${JSON.stringify(trace)},'setup\\n');project.provide('seed',{nested:{value:1}});return()=>appendFileSync(${JSON.stringify(trace)},'teardown\\n')}`
    )
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  async function rows() {
    return (await readFile(trace, 'utf8')).trim().split('\n').filter(Boolean)
  }

  it('retains fulfilled actual provided context with fresh clones and one final teardown', async () => {
    const generation = new AbortController()
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory, generation.signal)
    try {
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(true)
      await owner.setup([])
      expect(await rows()).toEqual([])
      const first = structuredClone(owner.config.projects)
      await owner.setup(first)
      expect(first[0].provide).toEqual({
        configured: 'first',
        seed: { nested: { value: 1 } },
      })
      ;(first[0].provide!.seed as { nested: { value: number } }).nested.value =
        99
      generation.abort(new Error('original generation closed'))
      await writeFile(
        path.join(directory, 'setup.mjs'),
        "throw new Error('edited setup must not run in this retained owner')"
      )
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(true)
      const next = structuredClone(owner.config.projects)
      const laterGeneration = new AbortController()
      laterGeneration.abort(new Error('later generation cancelled'))
      await owner.setup(next, laterGeneration.signal)
      expect(next[0].provide).toEqual({
        configured: 'first',
        seed: { nested: { value: 1 } },
      })
      expect(await rows()).toEqual(['setup'])
    } finally {
      await owner.dispose()
      await owner.dispose()
    }
    expect(await rows()).toEqual(['setup', 'teardown'])
    await expect(
      owner.setup(structuredClone(owner.config.projects))
    ).rejects.toThrow('retained global setup configuration is unavailable')
  })

  it('reopens after the original generation is cancelled before setup is entered', async () => {
    const generation = new AbortController()
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory, generation.signal)
    expect(
      await owner.retainGlobalSetupForWatch(
        lifetime.signal,
        owner.config.projects
      )
    ).toBe(true)
    generation.abort(new Error('cancelled before setup'))
    expect(
      await owner.retainGlobalSetupForWatch(
        lifetime.signal,
        owner.config.projects
      )
    ).toBe(false)
    await owner.dispose()
    expect(await rows()).toEqual([])
    const next = await openTestConfiguration(directory)
    try {
      expect(
        await next.retainGlobalSetupForWatch(
          lifetime.signal,
          next.config.projects
        )
      ).toBe(true)
      await next.setup(structuredClone(next.config.projects))
      expect(await rows()).toEqual(['setup'])
    } finally {
      await next.dispose()
    }
    expect(await rows()).toEqual(['setup', 'teardown'])
  })

  it.each(['production', 'rsc', 'shared', 'jsdom'] as const)(
    'keeps the actual %s selection generation-owned even after declared Node admission',
    async (selection) => {
      const generation = new AbortController()
      const lifetime = new AbortController()
      const owner = await openTestConfiguration(directory, generation.signal)
      const effective = structuredClone(
        applyTestConfigOverrides(owner.config, { retry: 2 }).projects
      )
      if (selection === 'production') effective[0].profile.mode = 'production'
      else if (selection === 'rsc') effective[0].profile.environment = 'rsc'
      else if (selection === 'shared') effective[0].isolate = false
      else effective[0].executionEnvironment = { name: 'jsdom', options: {} }
      try {
        expect(
          await owner.retainGlobalSetupForWatch(lifetime.signal, effective)
        ).toBe(false)
        expect(
          await owner.retainGlobalSetupForWatch(
            lifetime.signal,
            owner.config.projects
          )
        ).toBe(true)
        await owner.setup(effective)
        expect(await rows()).toEqual(['setup'])
        expect(
          await owner.retainGlobalSetupForWatch(
            lifetime.signal,
            owner.config.projects
          )
        ).toBe(false)
        generation.abort(new Error('actual unqualified generation closed'))
      } finally {
        await owner.dispose()
      }
      expect(await rows()).toEqual(['setup', 'teardown'])
    }
  )

  it('does not memoize partial setup failure and drains its actual returned cleanup', async () => {
    const file = path.join(directory, 'next.test.config.json')
    const config = JSON.parse(await readFile(file, 'utf8'))
    config.projects[0].globalSetup.push('./failure.mjs')
    await writeFile(file, JSON.stringify(config))
    await writeFile(
      path.join(directory, 'failure.mjs'),
      "export default function(){throw new Error('actual partial setup failure')}"
    )
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory)
    try {
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(true)
      await expect(
        owner.setup(structuredClone(owner.config.projects))
      ).rejects.toThrow('actual partial setup failure')
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(false)
      expect(await rows()).toEqual(['setup', 'teardown'])
    } finally {
      await expect(owner.dispose()).rejects.toThrow(
        'Test configuration session ended unexpectedly (exit)'
      )
    }
    expect(await rows()).toEqual(['setup', 'teardown'])
  })

  it('refuses changed configuration bytes and preserves old teardown before replacement setup', async () => {
    const lifetime = new AbortController()
    const first = await openTestConfiguration(directory)
    expect(
      await first.retainGlobalSetupForWatch(
        lifetime.signal,
        first.config.projects
      )
    ).toBe(true)
    await first.setup(structuredClone(first.config.projects))
    const file = path.join(directory, 'next.test.config.json')
    const config = JSON.parse(await readFile(file, 'utf8'))
    config.projects[0].provide.configured = 'replacement'
    await writeFile(file, JSON.stringify(config))
    expect(
      await first.retainGlobalSetupForWatch(
        lifetime.signal,
        first.config.projects
      )
    ).toBe(false)
    await expect(
      first.retainGlobalSetupForWatch(
        lifetime.signal,
        first.config.projects,
        true
      )
    ).rejects.toThrow('changed during evaluation')
    await first.dispose()
    expect(await rows()).toEqual(['setup', 'teardown'])
    const replacement = await openTestConfiguration(directory)
    try {
      expect(
        await replacement.retainGlobalSetupForWatch(
          lifetime.signal,
          replacement.config.projects
        )
      ).toBe(true)
      const selected = structuredClone(replacement.config.projects)
      await replacement.setup(selected)
      expect(selected[0].provide?.configured).toBe('replacement')
      expect(await rows()).toEqual(['setup', 'teardown', 'setup'])
    } finally {
      await replacement.dispose()
    }
    expect(await rows()).toEqual(['setup', 'teardown', 'setup', 'teardown'])
  })

  it('refuses foreign or newly unqualified cached selections before a context handoff', async () => {
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory)
    try {
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(true)
      await owner.setup(structuredClone(owner.config.projects))
      const foreign = structuredClone(owner.config.projects)
      foreign[0].profile.id = 'foreign'
      await expect(owner.setup(foreign)).rejects.toThrow('Unknown project')
      const shared = structuredClone(owner.config.projects)
      shared[0].isolate = false
      await expect(owner.setup(shared)).rejects.toThrow('Unsupported project')
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(false)
      await expect(
        owner.setup(structuredClone(owner.config.projects))
      ).rejects.toThrow('retained global setup configuration is unavailable')
      expect(await rows()).toEqual(['setup'])
    } finally {
      await owner.dispose()
    }
    expect(await rows()).toEqual(['setup', 'teardown'])
  })

  it('keeps pending setup generation-owned and permits a fresh healthy owner after cancellation', async () => {
    const source = await readFile(path.join(directory, 'setup.mjs'), 'utf8')
    await writeFile(
      path.join(directory, 'setup.mjs'),
      `import {appendFileSync} from 'node:fs';export default async function(){appendFileSync(${JSON.stringify(trace)},'entered\\n');await new Promise(()=>{})}`
    )
    const session = new AbortController()
    const generation = new AbortController()
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory, session.signal)
    try {
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(true)
      const pending = owner
        .setup(structuredClone(owner.config.projects), generation.signal)
        .then(
          () => null,
          (error) => error
        )
      await retry(
        async () => expect(await rows()).toEqual(['entered']),
        5000,
        50
      )
      const cancellation = new Error('cancelled pending setup')
      generation.abort(cancellation)
      expect(await pending).toBe(cancellation)
      expect(session.signal.aborted).toBe(false)
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(false)
    } finally {
      generation.abort(new Error('pending setup test closed'))
      await owner.dispose()
    }
    expect(await rows()).toEqual(['entered'])
    await writeFile(path.join(directory, 'setup.mjs'), source)
    const recovered = await openTestConfiguration(directory)
    try {
      expect(
        await recovered.retainGlobalSetupForWatch(
          lifetime.signal,
          recovered.config.projects
        )
      ).toBe(true)
      await recovered.setup(structuredClone(recovered.config.projects))
    } finally {
      await recovered.dispose()
    }
    expect(await rows()).toEqual(['entered', 'setup', 'teardown'])
  }, 30000)

  it('revokes cached context with the actual closed realm after its lifetime aborts', async () => {
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory)
    try {
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(true)
      await owner.setup(structuredClone(owner.config.projects))
      lifetime.abort(new Error('actual watch lifetime closed'))
      await owner.dispose()
      await expect(
        owner.retainGlobalSetupForWatch(
          new AbortController().signal,
          owner.config.projects
        )
      ).rejects.toThrow('retained global setup configuration is unavailable')
      await expect(
        owner.setup(structuredClone(owner.config.projects))
      ).rejects.toThrow('retained global setup configuration is unavailable')
    } finally {
      await owner.dispose()
    }
    expect(await rows()).toEqual(['setup', 'teardown'])
  })

  it('does not memoize an initial aborted run while the first discovery session remains live', async () => {
    const session = new AbortController()
    const generation = new AbortController()
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory, session.signal)
    try {
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(true)
      const cancellation = new Error('actual initial run already cancelled')
      generation.abort(cancellation)
      await expect(
        owner.setup(structuredClone(owner.config.projects), generation.signal)
      ).rejects.toBe(cancellation)
      expect(session.signal.aborted).toBe(false)
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(false)
      expect(await rows()).toEqual([])
    } finally {
      await owner.dispose()
    }
    const recovered = await openTestConfiguration(directory, session.signal)
    try {
      expect(
        await recovered.retainGlobalSetupForWatch(
          lifetime.signal,
          recovered.config.projects
        )
      ).toBe(true)
      await recovered.setup(
        structuredClone(recovered.config.projects),
        new AbortController().signal
      )
      expect(await rows()).toEqual(['setup'])
    } finally {
      await recovered.dispose()
    }
    expect(await rows()).toEqual(['setup', 'teardown'])
  })
})

describe('fulfilled retained setup source selection admission', () => {
  it('refuses an unfulfilled or failed setup and admits only the actual fulfilled owner', async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), 'next-setup-selection-')
    )
    const generation = new AbortController()
    const lifetime = new AbortController()
    let owner: Awaited<ReturnType<typeof openTestConfiguration>> | undefined
    try {
      await writeFile(
        path.join(directory, 'next.test.config.json'),
        JSON.stringify({
          projects: [
            {
              name: 'retained',
              environment: 'node',
              mode: 'development',
              globalSetup: ['./setup.mjs'],
            },
          ],
        })
      )
      await writeFile(
        path.join(directory, 'setup.mjs'),
        "export default function(project){project.provide('seed',1)}"
      )
      owner = await openTestConfiguration(directory, generation.signal)
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects,
          false,
          true
        )
      ).toBe(false)
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(true)
      await owner.setup(
        structuredClone(owner.config.projects),
        generation.signal
      )
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects,
          false,
          true
        )
      ).toBe(true)
      const changed = structuredClone(owner.config.projects)
      changed[0].isolate = false
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          changed,
          false,
          true
        )
      ).toBe(false)
      await writeFile(
        path.join(directory, 'next.test.config.json'),
        JSON.stringify({ projects: [] })
      )
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects,
          false,
          true
        )
      ).toBe(false)
      await owner.dispose()
      owner = undefined
      await writeFile(
        path.join(directory, 'next.test.config.json'),
        JSON.stringify({
          projects: [
            {
              name: 'retained',
              environment: 'node',
              mode: 'development',
              globalSetup: ['./setup.mjs'],
            },
          ],
        })
      )
      await writeFile(
        path.join(directory, 'setup.mjs'),
        "export default function(){throw new Error('real setup rejection')}"
      )
      owner = await openTestConfiguration(directory, generation.signal)
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects
        )
      ).toBe(true)
      await expect(
        owner.setup(structuredClone(owner.config.projects), generation.signal)
      ).rejects.toThrow('real setup rejection')
      expect(
        await owner.retainGlobalSetupForWatch(
          lifetime.signal,
          owner.config.projects,
          false,
          true
        )
      ).toBe(false)
      await expect(owner.dispose()).rejects.toThrow(
        'Test configuration session ended unexpectedly (exit)'
      )
      owner = undefined
    } finally {
      await owner?.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('editor physical file reruns', () => {
  const entry: TestEntry = {
    id: 'first:only /physical',
    file: '/selected/only.test.mjs',
    profile: {
      id: 'first',
      environment: 'node',
      mode: 'development',
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
  }
  const similar: TestEntry = {
    ...entry,
    id: 'first:similar',
    file: '/selected/similar-only.test.mjs',
  }
  const envelope = {
    version: 1 as const,
    runId: 'settled/actual',
    timestamp: 1,
  }
  const route = (runId: string, entryId: string) =>
    '/v1/runs/' +
    encodeURIComponent(runId) +
    '/files/' +
    encodeURIComponent(entryId) +
    '/rerun'

  it('keeps exact file ownership, acknowledges once and resets the next generation', async () => {
    const { openTestDiscoveryApi } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    const rerun = jest.fn(),
      rerunFile = jest.fn()
    const api = await openTestDiscoveryApi('/selected', [entry, similar], 0, {
      cancelRun() {},
      rerun,
      rerunFile,
    })
    const post = (id: string) =>
      fetch(new URL(route(envelope.runId, id), api.url), { method: 'POST' })
    try {
      expect((await (await fetch(api.url)).json()).controls).toEqual({
        cancel: true,
        rerun: true,
      })
      expect((await (await fetch(api.url)).json()).fileControls).toEqual({
        rerun: true,
        entries: [entry.id, similar.id],
      })
      api.prepareRun([entry, similar])
      api.onEvent({ ...envelope, type: 'run-start' })
      api.onEvent({
        ...envelope,
        type: 'run-end',
        status: 'passed',
        durationMs: 0,
      })
      const accepted = await post(entry.id)
      expect(accepted.status).toBe(202)
      expect(await accepted.json()).toMatchObject({
        command: 'rerun-file',
        entryId: entry.id,
        runId: envelope.runId,
        status: 'accepted',
      })
      expect(await (await post(entry.id)).json()).toMatchObject({
        status: 'already-requested',
      })
      expect((await post(similar.id)).status).toBe(409)
      expect(
        (
          await fetch(
            new URL(
              '/v1/runs/' + encodeURIComponent(envelope.runId) + '/rerun',
              api.url
            ),
            { method: 'POST' }
          )
        ).status
      ).toBe(409)
      expect(rerunFile.mock.calls).toEqual([[entry.id]])
      expect(rerun).not.toHaveBeenCalled()
      api.prepareRun([similar])
      const next = { ...envelope, runId: 'next' }
      api.onEvent({ ...next, type: 'run-start' })
      api.onEvent({ ...next, type: 'run-end', status: 'passed', durationMs: 0 })
      expect(
        (await (await fetch(api.url)).json()).fileControls.entries
      ).toEqual([similar.id])
      expect(
        (
          await fetch(new URL(route(next.runId, entry.id), api.url), {
            method: 'POST',
          })
        ).status
      ).toBe(409)
      expect(
        (
          await fetch(new URL(route(next.runId, similar.id), api.url), {
            method: 'POST',
          })
        ).status
      ).toBe(202)
      expect(rerunFile.mock.calls).toEqual([[entry.id], [similar.id]])
    } finally {
      await api.dispose()
    }
  })

  it.each([
    'not started',
    'running',
    'stale',
    'unknown',
    'foreign profile',
  ] as const)('does not execute a file action for %s', async (scenario) => {
    const { openTestDiscoveryApi } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    const selected: TestEntry =
      scenario === 'foreign profile'
        ? { ...entry, profile: { ...entry.profile, environment: 'browser' } }
        : entry
    const rerunFile = jest.fn()
    const api = await openTestDiscoveryApi('/selected', [selected], 0, {
      cancelRun() {},
      rerunFile,
    })
    try {
      if (scenario !== 'not started') {
        api.prepareRun([selected])
        api.onEvent({ ...envelope, type: 'run-start' })
        if (scenario !== 'running')
          api.onEvent({
            ...envelope,
            type: 'run-end',
            status: 'passed',
            durationMs: 0,
          })
      }
      const target = new URL(
        route(
          scenario === 'stale' ? 'stale' : envelope.runId,
          scenario === 'unknown' ? 'unselected' : selected.id
        ),
        api.url
      )
      expect((await fetch(target, { method: 'POST' })).status).toBe(409)
      expect(rerunFile).not.toHaveBeenCalled()
      if (scenario === 'foreign profile')
        expect(
          (await (await fetch(api.url)).json()).fileControls
        ).toBeUndefined()
      expect((await fetch(target, { method: 'GET' })).status).toBe(405)
      expect(
        (
          await fetch(new URL('/v1/runs/%ZZ/files/file/rerun', api.url), {
            method: 'POST',
          })
        ).status
      ).toBe(400)
    } finally {
      await api.dispose()
    }
  })

  it('retains the first full rerun and reports file callback failures', async () => {
    const { openTestDiscoveryApi } = await import(
      'next/dist/experimental/testing/editor-api'
    )
    const rerun = jest.fn(),
      rerunFile = jest.fn()
    const api = await openTestDiscoveryApi('/selected', [entry], 0, {
      cancelRun() {},
      rerun,
      rerunFile,
    })
    try {
      api.onEvent({ ...envelope, type: 'run-start' })
      api.onEvent({
        ...envelope,
        type: 'run-end',
        status: 'passed',
        durationMs: 0,
      })
      expect(
        (
          await fetch(
            new URL(
              '/v1/runs/' + encodeURIComponent(envelope.runId) + '/rerun',
              api.url
            ),
            { method: 'POST' }
          )
        ).status
      ).toBe(202)
      expect(
        (
          await fetch(new URL(route(envelope.runId, entry.id), api.url), {
            method: 'POST',
          })
        ).status
      ).toBe(409)
      expect(rerun).toHaveBeenCalledTimes(1)
      expect(rerunFile).not.toHaveBeenCalled()
    } finally {
      await api.dispose()
    }
    const failure = new Error('controlled file owner failure')
    const failed = await openTestDiscoveryApi('/selected', [entry], 0, {
      cancelRun() {},
      rerunFile() {
        throw failure
      },
    })
    failed.onEvent({ ...envelope, type: 'run-start' })
    failed.onEvent({
      ...envelope,
      type: 'run-end',
      status: 'passed',
      durationMs: 0,
    })
    expect(
      (
        await fetch(new URL(route(envelope.runId, entry.id), failed.url), {
          method: 'POST',
        })
      ).status
    ).toBe(202)
    expect((await fetch(failed.url)).status).toBe(503)
    await expect(failed.dispose()).rejects.toBe(failure)
  })
})

it('stops claiming files on user cancellation while already claimed owners settle', async () => {
  let entered!: () => void
  const bothEntered = new Promise<void>((resolve) => {
    entered = resolve
  })
  let release!: () => void
  const closed = new Promise<void>((resolve) => {
    release = resolve
  })
  const lifetime = new AbortController()
  const user = new AbortController()
  const claimed: number[] = []
  const settled: number[] = []
  let finished = false
  const run = forEachTestFile(
    [0, 1, 2, 3],
    2,
    lifetime.signal,
    async (file) => {
      claimed.push(file)
      if (claimed.length === 2) entered()
      await closed
      settled.push(file)
    },
    () => user.signal.aborted
  ).then(() => {
    finished = true
  })
  await bothEntered
  user.abort()
  expect(claimed).toEqual([0, 1])
  expect(settled).toEqual([])
  expect(finished).toBe(false)
  expect(lifetime.signal.aborted).toBe(false)
  release()
  await run
  expect(claimed).toEqual([0, 1])
  expect(settled).toEqual([0, 1])
})

describe('execution-only Firefox Browser instances', () => {
  it.each(['development', 'production'] as const)(
    'separates mixed %s instance names, compiler identities and actual engines',
    (mode) => {
      const projects = parseTestConfig({
        projects: [
          { name: 'browser-instance-0' },
          {
            name: 'parent',
            mode,
            browser: {
              enabled: true,
              instances: [
                { browser: 'chromium' },
                { browser: 'firefox' },
                { browser: 'firefox', name: 'second / fox' },
              ],
            },
          },
        ],
      }).projects
      expect(projects.map((project) => project.profile.id)).toEqual([
        'browser-instance-0',
        'browser-instance-1',
        'browser-instance-2',
        'browser-instance-3',
      ])
      expect(projects.map((project) => project.displayName)).toEqual([
        'browser-instance-0',
        'parent (chromium)',
        'parent (firefox)',
        'second / fox',
      ])
      expect(projects[1]).not.toHaveProperty('browserEngine')
      expect(projects.slice(2).map((project) => project.browserEngine)).toEqual(
        ['firefox', 'firefox']
      )
      for (const project of projects.slice(1)) {
        expect(project.profile).not.toHaveProperty('browserEngine')
        expect(project.profile).toMatchObject({ mode, browserClient: true })
      }
      expect(() =>
        normalizeTestConfig({
          test: {
            browser: {
              enabled: true,
              instances: [
                { browser: 'chromium', name: 'repeated' },
                { browser: 'firefox', name: 'repeated' },
              ],
            },
          },
        })
      ).toThrow('Duplicate project name "repeated"')
    }
  )

  it('keeps inactive Firefox selection in its original Node profile', () => {
    const project = normalizeTestConfig({
      test: {
        name: 'inactive',
        browser: {
          enabled: false,
          instances: [{ browser: 'firefox' }],
        },
      },
    }).projects[0]
    expect(project.profile).toEqual({
      id: 'inactive',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    })
    expect(project).not.toHaveProperty('browserEngine')
    expect(project).not.toHaveProperty('browserInstance')
  })

  it('keeps raw runtime engine fields out of the authored configuration', () => {
    expect(() =>
      parseTestConfig({ projects: [{ name: 'raw', browserEngine: 'firefox' }] })
    ).toThrow(/browserEngine/)
  })
})

describe('Browser parent non-execution completion', () => {
  it.each([
    'valid',
    'no-request',
    'started',
    'terminal',
    'output',
    'malformed',
    'cleanup',
  ] as const)(
    'preserves actual non-execution and cleanup for %s',
    async (kind) => {
      const config = parseTestConfig({
        projects: [
          {
            name: 'client',
            browser: { enabled: true, instances: [{ browser: 'chromium' }] },
          },
        ],
      }).projects[0]
      const entry: TestEntry = {
        id: 'client:queued.case.mjs',
        file: '/application/queued.case.mjs',
        profile: config.profile,
      }
      const project: DiscoveredTestProject = { ...config, entries: [entry] }
      const artifact = {
        version: 2,
        kind: 'browser',
        entryId: entry.id,
        profile: config.profile,
        revision: 'queued-revision',
        rootDir: '/queued-artifact',
        entryPath: 'queued.client.json',
        files: [],
        diagnostics: [],
        client: { sourceFile: entry.file },
      } as CompiledTestArtifact
      const user = new AbortController()
      const events: ResultEvent[] = []
      const dispose = jest.fn(async () => {
        if (kind === 'cleanup')
          throw new Error('Actual compiler cleanup failed')
      })
      const session = {
        compile: jest.fn(async () => artifact),
        shutdownCompilation: jest.fn(async () => {}),
        dispose,
      }
      const compiler = jest.mocked(createTestCompilerSession)
      const capability = jest.mocked(capabilities.requireTestCapability)
      const previousCompiler = compiler.getMockImplementation()
      const previousCapability = capability.getMockImplementation()
      const previousMode = process.env.NODE_ENV
      try {
        ;(process.env as any).NODE_ENV = 'development'
        capability.mockImplementation(() => {})
        compiler.mockResolvedValue(session as any)
        const result = await runTests('/application', [project], {
          signal: new AbortController().signal,
          userCancelSignal: user.signal,
          brokerOwnsBrowser: true,
          write: () => {},
          onEvent: (event) => events.push(event),
          execute: async (_artifact, options) => {
            if (kind !== 'no-request') user.abort()
            const envelope = {
              version: 1 as const,
              runId: options.runId,
              timestamp: Date.now(),
              revision: artifact.revision,
            }
            if (kind === 'started')
              options.onEvent({ ...envelope, type: 'file-start', entry })
            if (kind === 'terminal')
              options.onEvent({
                ...envelope,
                type: 'file-end',
                entryId: entry.id,
                status: 'passed',
                durationMs: 0,
              })
            if (kind === 'output')
              options.onEvent({
                ...envelope,
                type: 'output',
                entryId: entry.id,
                stream: 'stdout',
                text: 'Contradictory authored output',
              })
            return {
              entryId: entry.id,
              status: 'cancelled',
              durationMs: kind === 'malformed' ? 1 : 0,
              notExecuted: true,
            }
          },
        })
        expect(dispose).toHaveBeenCalledTimes(1)
        if (kind === 'valid' || kind === 'cleanup') {
          if (kind === 'valid') {
            expect(
              events.filter(
                (event) =>
                  event.type === 'file-start' || event.type === 'file-end'
              )
            ).toEqual([])
            expect(result.status).toBe('passed')
            expect(
              events.filter((event) => event.type === 'diagnostic')
            ).toEqual([])
          } else {
            expect(result.status).toBe('failed')
            expect(result.unsafeCleanup).toBe(true)
            expect(
              events.filter(
                (event) =>
                  event.type === 'case-start' || event.type === 'case-end'
              )
            ).toEqual([])
            expect(events).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  type: 'file-end',
                  entryId: entry.id,
                  status: 'cancelled',
                }),
              ])
            )
            expect(events).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  type: 'diagnostic',
                  diagnostic: expect.objectContaining({
                    message: 'Actual compiler cleanup failed',
                  }),
                }),
              ])
            )
          }
        } else {
          expect(result.status).toBe('failed')
          expect(events).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                type: 'diagnostic',
                diagnostic: expect.objectContaining({
                  message: 'Invalid parent non-execution acknowledgment.',
                }),
              }),
            ])
          )
          expect(events).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                type: 'file-end',
                entryId: entry.id,
                status: 'failed',
              }),
            ])
          )
        }
      } finally {
        compiler.mockImplementation(previousCompiler!)
        capability.mockImplementation(previousCapability!)
        if (previousMode === undefined) delete (process.env as any).NODE_ENV
        else (process.env as any).NODE_ENV = previousMode
      }
    }
  )
})

describe('explicit enabled Browser headless configuration', () => {
  it.each([false, true])(
    'preserves headless=%s across real selected engine instances',
    (headless) => {
      const config = normalizeTestConfig({
        test: {
          browser: {
            enabled: true,
            headless,
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }],
          },
        },
      })
      expect(config.projects.map((project) => project.browserHeadless)).toEqual(
        [headless, headless]
      )
      expect(
        config.projects.map((project) => project.browserEngine ?? 'chromium')
      ).toEqual(['chromium', 'firefox'])
      expect(
        config.projects.every(
          (project) => !('browserHeadless' in project.profile)
        )
      ).toBe(true)
      expect(
        new Set(config.projects.map((project) => project.profile.id)).size
      ).toBe(2)
    }
  )

  it('keeps omission and disabled Browser settings absent from execution', () => {
    for (const browser of [
      { enabled: true },
      { enabled: false, headless: true },
      { enabled: false, headless: false },
    ]) {
      const project = normalizeTestConfig({ test: { browser } }).projects[0]
      expect(Object.hasOwn(project, 'browserHeadless')).toBe(false)
    }
  })

  it.each([null, 0, 1, 'true', 'false', {}, []])(
    'rejects malformed authored headless mode %j',
    (headless) => {
      expect(() =>
        normalizeTestConfig({ test: { browser: { enabled: true, headless } } })
      ).toThrow('browser.headless must be a boolean')
    }
  )

  it.each([false, true])(
    'applies CLI headless=%s only to enabled Browser projects without mutating original config',
    (headless) => {
      const original = normalizeTestConfig({
        test: {
          projects: [
            { name: 'node' },
            { name: 'disabled', browser: { enabled: false, headless: true } },
            {
              name: 'browser',
              browser: { enabled: true, headless: !headless },
            },
          ],
        },
      })
      const resolved = applyTestConfigOverrides(original, {
        browserHeadless: headless,
      })
      expect(
        resolved.projects.map((project) => project.browserHeadless)
      ).toEqual([undefined, undefined, headless])
      expect(original.projects[2].browserHeadless).toBe(!headless)
      expect(
        resolved.projects
          .slice(0, 2)
          .every((project) => !Object.hasOwn(project, 'browserHeadless'))
      ).toBe(true)
      expect(
        applyTestConfigOverrides(original, { browserHeadless: undefined })
      ).toEqual(original)
    }
  )
})

describe('Browser launch defaults use the pinned configuration environment', () => {
  it.each([
    ['local', {}, false],
    ['empty CI', { CI: '' }, false],
    ['false string CI', { CI: 'false' }, true],
    ['zero string CI', { CI: '0' }, true],
    ['CI', { CI: 'true' }, true],
    ['provider', { GITHUB_ACTIONS: 'true' }, true],
    ['local provider', { VERCEL: '1' }, false],
    ['local provider with CI', { VERCEL: '1', CI: 'false' }, true],
    ['provider precedence', { NETLIFY: '1', NETLIFY_LOCAL: '1' }, true],
    ['local provider precedence', { NETLIFY_LOCAL: '1', TRAVIS: '1' }, false],
  ] as const)(
    'preserves the actual CI default for %s',
    (_name, values, expected) => {
      const previous = process.env
      const environment = { NODE_ENV: previous.NODE_ENV, PATH: previous.PATH }
      process.env = { ...environment, ...values }
      try {
        jest.isolateModules(() => {
          const { isTestCI } = jest.requireActual(
            'next/dist/experimental/testing/config-environment'
          )
          const { configDefaults: defaults } = jest.requireActual(
            'next/dist/experimental/testing/config-api'
          )
          expect(isTestCI).toBe(expected)
          expect(defaults.allowOnly).toBe(!expected)
        })
      } finally {
        process.env = previous
      }
    }
  )
})

it.each([undefined, false, true])(
  'preserves explicit declaration location setting %s through project overrides',
  (includeTaskLocation) => {
    const config = parseTestConfig({
      projects: [{ name: 'locations', includeTaskLocation }],
    })
    expect(config.projects[0].includeTaskLocation).toBe(includeTaskLocation)
    expect(Object.hasOwn(config.projects[0], 'includeTaskLocation')).toBe(
      includeTaskLocation !== undefined
    )
    expect(
      applyTestConfigOverrides(config, { includeTaskLocation: false })
        .projects[0].includeTaskLocation
    ).toBe(false)
    expect(
      applyTestConfigOverrides(config, { includeTaskLocation: true })
        .projects[0].includeTaskLocation
    ).toBe(true)
  }
)

it('rejects nonboolean authored declaration location settings', () => {
  expect(() =>
    parseTestConfig({
      projects: [{ name: 'locations', includeTaskLocation: 'false' }],
    })
  ).toThrow('includeTaskLocation must be a boolean')
})

it('retains test configuration watch inputs separately from evaluated compiler roles', async () => {
  const directory = await realpath(
    await mkdtemp(path.join(os.tmpdir(), 'next-test-config-roles-'))
  )
  const file = path.join(directory, 'vitest.config.mjs')
  const helper = path.join(directory, 'compiler-value.mjs')
  try {
    for (const kind of ['test-only', 'alias', 'transform', 'projects']) {
      await writeFile(helper, 'export const value = 42')
      await writeFile(
        file,
        kind === 'test-only'
          ? 'export default {test:{coverage:{enabled:true,thresholds:{autoUpdate:true}},include:["*.case.mjs"]}}'
          : kind === 'alias'
            ? 'import {fileURLToPath} from "node:url";import {value} from "./compiler-value.mjs";export default {resolve:{alias:{"@value":fileURLToPath(new URL("./value-"+value+".mjs",import.meta.url))}},test:{include:["*.case.mjs"]}}'
            : kind === 'transform'
              ? 'import {value} from "./compiler-value.mjs";export default {plugins:[{name:"retained",transform(code){return code.replace("VALUE",String(value))}}],test:{include:["*.case.mjs"]}}'
              : 'export default {test:{projects:[{test:{name:"first",include:["*.case.mjs"]}},{test:{name:"second",include:["*.case.mjs"]}}]}}'
      )
      const session = await openTestConfiguration(directory)
      try {
        expect(session.watchInputs).toContain(file)
        if (kind === 'alias' || kind === 'transform') {
          expect(session.compilerInputs).toContain(file)
          expect(session.compilerInputs).toContain(helper)
        } else {
          expect(session.compilerInputs).toEqual([])
        }
      } finally {
        await session.dispose()
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)

describe('ordinary production Node project environment', () => {
  it('normalizes ordinary runtime env values in the actual production profile without mutating the host', () => {
    const before = process.env.VALUE
    const config = parseTestConfig({
      projects: [
        { name: 'invalid', mode: 'production', env: { VALUE: 'value' } },
      ],
    })
    expect(config.projects[0].env).toEqual({ VALUE: 'value' })
    expect(config.projects[0].profile.mode).toBe('production')
    expect(process.env.VALUE).toBe(before)
  })
})

it('copies owned project clock getters without coercing values or touching excluded owners', async () => {
  const { stdout: output, stderr } = await runNodeHelper(
    [path.join(__dirname, 'project-fake-timers.cjs')],
    { timeout: 30000, encoding: 'utf8' }
  )
  if (stderr) throw new Error(stderr)
  expect(JSON.parse(output)).toEqual({
    controls: 42,
    actualBuiltProducer: true,
    owningCopyOnly: true,
    originalReceiversAndThrownValues: true,
    undefinedPresenceRetained: true,
    arraysNotIterated: true,
    legacyUnrelatedAccessorsProxyHooksHeld: true,
  })
}, 35000)

describe('project filter patterns before shard assignment', () => {
  const corpus = path.join(__dirname, 'fixtures/project-pattern-selection')
  const projectNames = ['web-A', 'web-b', 'unit1', 'dbprod', 'api-e2e']
  const caseFiles = ['a.case.mjs', 'b.case.mjs', 'c.case.mjs']
  const selections = [
    { label: 'wildcard', selection: 'web-*', projects: ['web-A', 'web-b'] },
    {
      label: 'case-wildcard',
      selection: 'WEB-*',
      projects: ['web-A', 'web-b'],
    },
    {
      label: 'exclude',
      selection: '!web-*',
      projects: ['unit1', 'dbprod', 'api-e2e'],
    },
    { label: 'exact-unit', selection: 'unit1', projects: ['unit1'] },
    { label: 'exact-db', selection: 'dbprod', projects: ['dbprod'] },
    { label: 'exact-api', selection: 'api-e2e', projects: ['api-e2e'] },
    {
      label: 'shard-1',
      selection: 'web-*',
      shard: '1/2',
      files: ['web-A:a.case.mjs', 'web-A:b.case.mjs', 'web-b:a.case.mjs'],
    },
    {
      label: 'shard-2',
      selection: 'web-*',
      shard: '2/2',
      files: ['web-A:c.case.mjs', 'web-b:b.case.mjs', 'web-b:c.case.mjs'],
    },
  ]
  async function fixture<T>(run: (root: string) => Promise<T>) {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'next-project-pattern-'))
    )
    try {
      for (const name of caseFiles)
        await cp(path.join(corpus, name + '.txt'), path.join(root, name))
      return await run(root)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
  it.each(
    ['development', 'production'].flatMap((mode) =>
      selections.map((selection) => ({ ...selection, mode }))
    )
  )('selects $mode $label project/file identities', async (expected) => {
    await fixture(async (root) => {
      const config = parseTestConfig({
        projects: projectNames.map((name) => ({
          name,
          mode: expected.mode,
          include: ['*.case.mjs'],
          provide: { project: name },
        })),
      })
      const input = JSON.stringify(config)
      const discovered = await discoverTests(root, config, {
        project: expected.selection,
      })
      const projects = expected.shard
        ? await shardTestProjects(
            discovered,
            parseTestShard(expected.shard),
            root,
            { sortFiles: false }
          )
        : discovered
      const actual = projects.flatMap((project) =>
        project.entries.map((entry) => ({
          project: project.displayName,
          file: path.basename(entry.file),
        }))
      )
      const expectedIds =
        expected.files ??
        expected.projects!.flatMap((name) =>
          caseFiles.map((file) => `${name}:${file}`)
        )
      expect(
        actual.map(({ project, file }) => `${project}:${file}`).sort()
      ).toEqual([...expectedIds].sort())
      expect(actual).toHaveLength(expectedIds.length)
      expect(JSON.stringify(config)).toBe(input)
      expect(new Set(projects.map((project) => project.profile.mode))).toEqual(
        new Set([expected.mode])
      )
    })
  })
  it('keeps file selection inside the project pattern and partitions each selected identity once', async () => {
    await fixture(async (root) => {
      const config = parseTestConfig({
        projects: projectNames.map((name) => ({
          name,
          include: ['*.case.mjs'],
        })),
      })
      const selected = await discoverTests(root, config, {
        project: 'WEB-*',
        files: ['b.case.mjs'],
      })
      expect(selected.map((project) => project.profile.id)).toEqual([
        'web-A',
        'web-b',
      ])
      const shards = await Promise.all(
        [1, 2].map((index) =>
          shardTestProjects(selected, { index, count: 2 }, root)
        )
      )
      const ids = shards.flatMap((projects) =>
        projects.flatMap((project) => project.entries.map((entry) => entry.id))
      )
      expect(ids.sort()).toEqual(['web-A:b.case.mjs', 'web-b:b.case.mjs'])
      expect(new Set(ids).size).toBe(ids.length)
    })
  })
  it.each(['web-?', 'unit[1]', '[web-*]', 'missing', '!*'])(
    'keeps a missing selection visible for %s',
    async (project) => {
      await fixture(async (root) => {
        const config = parseTestConfig({
          projects: projectNames.map((name) => ({
            name,
            include: ['*.case.mjs'],
          })),
        })
        await expect(discoverTests(root, config, { project })).rejects.toThrow(
          'Unknown test project'
        )
      })
    }
  )
  it('uses browser public instance and parent names while preserving private profile IDs', async () => {
    await fixture(async (root) => {
      const config = parseTestConfig({
        projects: [
          {
            name: 'browser-parent',
            environment: 'browser',
            include: ['*.case.mjs'],
            browser: {
              enabled: true,
              instances: [
                { browser: 'chromium', name: 'Web-A' },
                { browser: 'firefox', name: 'Web-B' },
              ],
            },
          },
        ],
      })
      const all = await discoverTests(root, config, { project: 'BROWSER-*' })
      expect(all.map((project) => project.displayName)).toEqual([
        'Web-A',
        'Web-B',
      ])
      const one = await discoverTests(root, config, { project: 'web-a' })
      expect(one.map((project) => project.displayName)).toEqual(['Web-A'])
      expect(one[0].profile.id).toBe(all[0].profile.id)
      const remaining = await discoverTests(root, config, { project: '!WEB-A' })
      expect(remaining.map((project) => project.displayName)).toEqual(['Web-B'])
      await expect(
        discoverTests(root, config, { project: '!browser-*' })
      ).rejects.toThrow('Unknown test project')
    })
  })
  it.each(['development', 'production'])(
    'preserves complete genuine %s file reports when merging the selected shards',
    async (mode) => {
      const { mergeResultReports } = await import(
        'next/dist/experimental/testing/reporting/machine'
      )
      await fixture(async (root) => {
        const blobs = path.join(root, 'blobs')
        await mkdir(blobs)
        for (const index of [1, 2])
          await cp(
            path.join(corpus, `${mode}-shard-${index}.blob`),
            path.join(blobs, `shard-${index}.blob`)
          )
        const status = await mergeResultReports(blobs, {
          projectDir: root,
          reporters: ['json'],
          outputFile: 'merged.json',
        })
        expect(status).toBe('passed')
        const actual = JSON.parse(
          await readFile(path.join(root, 'merged.json'), 'utf8')
        )
        const expected = JSON.parse(
          await readFile(path.join(corpus, `${mode}-merged.json`), 'utf8')
        )
        // The merger's new wall-clock start and explicit imported-evidence
        // annotation are separate. Every retained file/case byte stays exact.
        const { startTime: _expectedStart, ...expectedReport } = expected
        const {
          startTime: _actualStart,
          vitest: evidence,
          ...actualReport
        } = actual
        expect(actualReport).toEqual(expectedReport)
        expect(evidence.version).toBe('5.0.4')
        expect(evidence.blobs).toHaveLength(2)
      })
    }
  )
})

describe('ordinary custom reporter watch configuration ownership', () => {
  let directory: string

  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'next-reporters-watch-owner-'))
    )
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('retains the actual root JSON realm across generation cancellation and provides fresh setup data', async () => {
    const file = path.join(directory, 'next.test.config.json')
    await writeFile(
      file,
      JSON.stringify({
        projects: [
          {
            name: 'watch-owner',
            include: ['*.case.mjs'],
            provide: { initial: { value: 1 } },
          },
        ],
      })
    )
    const generation = new AbortController()
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory, generation.signal)
    try {
      expect(await owner.retainReportersForWatch(lifetime.signal)).toBe(true)
      const first = structuredClone(owner.config.projects)
      await owner.setup(first, generation.signal)
      expect(first[0].provide).toEqual({ initial: { value: 1 } })
      first[0].provide!.initial = { value: 2 }
      generation.abort(new Error('completed generation released'))
      expect(await owner.retainReportersForWatch(lifetime.signal)).toBe(true)
      const second = structuredClone(owner.config.projects)
      await owner.setup(second, new AbortController().signal)
      expect(second[0].provide).toEqual({ initial: { value: 1 } })
      expect(second[0].provide).not.toBe(first[0].provide)
    } finally {
      await owner.dispose()
      lifetime.abort()
    }
  }, 30000)

  it('refuses changed or newly selected config bytes without replacing the retained reporter owner', async () => {
    const file = path.join(directory, 'vitest.config.json')
    const source = JSON.stringify({
      projects: [{ name: 'watch-owner', include: ['*.case.mjs'] }],
    })
    await writeFile(file, source)
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory)
    try {
      expect(await owner.retainReportersForWatch(lifetime.signal)).toBe(true)
      await writeFile(file, source + '\n')
      expect(await owner.retainReportersForWatch(lifetime.signal)).toBe(false)
      await expect(
        owner.retainReportersForWatch(lifetime.signal, true)
      ).rejects.toThrow('configuration changed during evaluation')
      await writeFile(file, source)
      await writeFile(
        path.join(directory, 'next.test.config.json'),
        JSON.stringify({
          projects: [{ name: 'watch-owner', include: ['*.case.mjs'] }],
        })
      )
      expect(await owner.retainReportersForWatch(lifetime.signal)).toBe(false)
    } finally {
      await owner.dispose()
      lifetime.abort()
    }
  }, 30000)

  it('keeps executable configuration reload outside the supported reporter watch lifetime', async () => {
    await writeFile(
      path.join(directory, 'vitest.config.mjs'),
      "export default {test:{include:['*.case.mjs']}}"
    )
    const owner = await openTestConfiguration(directory)
    try {
      expect(
        await owner.retainReportersForWatch(new AbortController().signal)
      ).toBe(false)
    } finally {
      await owner.dispose()
    }
  }, 30000)

  it('keeps cancellation of the retained reporter lifetime distinct from a completed generation', async () => {
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory)
    const reason = new Error('retained reporter owner cancelled')
    try {
      expect(await owner.retainReportersForWatch(lifetime.signal)).toBe(true)
      lifetime.abort(reason)
      await expect(
        owner.setup(
          structuredClone(owner.config.projects),
          new AbortController().signal
        )
      ).rejects.toBe(reason)
    } finally {
      await owner.dispose()
    }
  }, 30000)

  it('does not silently skip authored global setup in the retained reporter lifetime', async () => {
    await writeFile(
      path.join(directory, 'next.test.config.json'),
      JSON.stringify({
        projects: [{ name: 'watch-owner', globalSetup: ['./setup.mjs'] }],
      })
    )
    await writeFile(
      path.join(directory, 'setup.mjs'),
      "import {writeFileSync} from 'node:fs'; export function setup(){writeFileSync(new URL('./setup-ran',import.meta.url),'unexpected')}"
    )
    const lifetime = new AbortController()
    const owner = await openTestConfiguration(directory)
    try {
      expect(await owner.retainReportersForWatch(lifetime.signal)).toBe(true)
      await expect(
        owner.setup(structuredClone(owner.config.projects))
      ).rejects.toThrow(
        'Custom reporter watch global setup is not implemented.'
      )
      await expect(
        readFile(path.join(directory, 'setup-ran'))
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await owner.dispose()
      lifetime.abort()
    }
  }, 30000)
})
