import path from 'path'
import { execFileSync } from 'child_process'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  symlinkSync,
  existsSync,
  copyFileSync,
  realpathSync,
  promises as fileSystem,
} from 'fs'
import { pathToFileURL } from 'url'
import { tmpdir } from 'os'
import { createHash, randomUUID } from 'crypto'
import { retry } from 'next-test-utils'
import {
  runTestProcess,
  type TestProcessOptions,
} from 'next/dist/experimental/testing/execution/process'
import { validateCompiledTestCohort } from 'next/dist/experimental/testing/execution/cohort'
import { createTestWorkerLease } from 'next/dist/experimental/testing/execution/worker-lease'
import { createArtifactSourceMapLookup } from 'next/dist/experimental/testing/execution/source-maps'
import { withFileCacheDirectory } from 'next/dist/experimental/testing/execution/file-cache'
import { parseTestInspectAddress } from 'next/dist/experimental/testing/execution/inspector'
import { assertArtifactProfile } from 'next/dist/experimental/testing/execution/artifact-profile'
import { createLateFailureSink } from 'next/dist/experimental/testing/execution/late-failures'
import { browserOutputDirectory } from 'next/dist/experimental/testing/execution/browser-output'
import { assertCompiledSetup } from 'next/dist/experimental/testing/execution/setup'
import { execute } from 'next/dist/experimental/testing/execution/execute'
import {
  executeCohort,
  isCohortExecutionClosedError,
} from 'next/dist/experimental/testing/execution/execute-cohort'
import {
  createExecutionBrokerHost,
  createExecutionBrokerClient,
  type ExecutionBrokerResponse,
} from 'next/dist/experimental/testing/execution/broker'
import type {
  CompiledTestCohort,
  ExecuteTestOptions,
} from 'next/dist/experimental/testing/contracts'
import type { ResultEvent } from 'next/dist/experimental/testing/reporting/events'
import type {
  WorkerInput,
  WorkerMessage,
} from 'next/dist/experimental/testing/execution/protocol'

jest.mock('next/dist/experimental/testing/client/execute', () => ({
  __esModule: true,
  ...jest.requireActual('next/dist/experimental/testing/client/execute'),
}))

const worker = path.join(__dirname, 'worker.cjs')
const options: TestProcessOptions = {
  cwd: __dirname,
  env: { ...process.env, NODE_ENV: 'development' },
  input: 'normal',
  timeoutMs: 5000,
  shutdownGraceMs: 100,
  onMessage() {},
}

describe('compiler-owned mock activation in the real file worker', () => {
  it.each([
    { marked: false, expose: true, status: 'passed' },
    { marked: true, expose: true, status: 'passed' },
    { marked: true, expose: false, status: 'failed' },
    {
      marked: false,
      expose: true,
      status: 'passed',
      testNamePattern: '^no match$',
    },
  ])(
    'handles marker=$marked and runtime=$expose',
    async ({ marked, expose, status, testNamePattern }) => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'next-worker-marker-'))
      try {
        copyFileSync(
          path.join(__dirname, 'mock-marker-entry.cjs'),
          path.join(rootDir, 'entry.cjs')
        )
        writeFileSync(
          path.join(rootDir, 'runtime-paths.json'),
          JSON.stringify({
            runner: require.resolve('next/dist/experimental/testing/runner'),
            mocking: require.resolve(
              'next/dist/experimental/testing/mocking/runtime'
            ),
            marked,
            expose,
          })
        )
        const profile = {
          id: 'unit',
          mode: 'development' as const,
          environment: 'node' as const,
          runtime: 'nodejs' as const,
          bundler: 'turbopack' as const,
        }
        const entry = {
          id: 'unit:marker',
          file: path.join(rootDir, 'spec.ts'),
          profile,
        }
        const input: WorkerInput = {
          artifact: {
            version: 2,
            kind: 'node',
            entryId: entry.id,
            profile,
            revision: 'marker-protocol',
            rootDir,
            entryPath: 'entry.cjs',
            files: ['entry.cjs', 'runtime-paths.json'],
            diagnostics: [],
            ...(marked ? { moduleMocking: { version: 1 as const } } : {}),
          },
          options: {
            runId: 'marker',
            projectDir: rootDir,
            entry,
            setupFiles: [],
            testTimeout: 1000,
            hookTimeout: 1000,
            testNamePattern,
            fileTimeout: 5000,
          },
          cacheScope: { type: 'file', directory: path.join(rootDir, 'cache') },
        }
        const messages: WorkerMessage[] = []
        const exit = await runTestProcess(
          require.resolve('next/dist/experimental/testing/execution/worker'),
          {
            ...options,
            cwd: rootDir,
            input,
            onMessage(message) {
              messages.push(message as WorkerMessage)
            },
          }
        )
        expect(exit.code).toBe(0)
        expect(messages.find((message) => message.type === 'complete')).toEqual(
          { type: 'complete', result: expect.objectContaining({ status }) }
        )
        if (testNamePattern) {
          expect(
            messages.some(
              (message) =>
                message.type === 'event' && message.event.type === 'case-start'
            )
          ).toBe(false)
          expect(
            messages.some(
              (message) =>
                message.type === 'event' &&
                message.event.type === 'case-end' &&
                message.event.status === 'skipped'
            )
          ).toBe(true)
        }
        if (!expose)
          expect(JSON.stringify(messages)).toContain(
            'missing its module mocking runtime'
          )
      } finally {
        rmSync(rootDir, { recursive: true, force: true })
      }
    }
  )
})

describe('owned runtime collection', () => {
  it.each([
    {
      mode: 'execution-fact-case-start',
      pattern: undefined,
      status: 'protocol-error',
      names: undefined,
    },
    {
      mode: 'execution-fact-case-end',
      pattern: undefined,
      status: 'protocol-error',
      names: undefined,
    },
    { mode: 'normal', pattern: undefined, status: 'passed', names: ['listed'] },
    { mode: 'normal', pattern: '^missing$', status: 'passed', names: [] },
    {
      mode: 'collection-error',
      pattern: undefined,
      status: 'failed',
      names: undefined,
    },
    {
      mode: 'cleanup-error',
      pattern: undefined,
      status: 'failed',
      names: undefined,
    },
    {
      mode: 'nonzero-exit',
      pattern: undefined,
      status: 'failed',
      names: undefined,
    },
  ])(
    'collects only after authoritative cleanup: $mode/$pattern',
    async ({ mode, pattern, status, names }) => {
      const rootDir = mkdtempSync(
        path.join(tmpdir(), 'next-worker-collection-')
      )
      try {
        copyFileSync(
          path.join(__dirname, 'collection-entry.cjs'),
          path.join(rootDir, 'entry.cjs')
        )
        const marker = path.join(rootDir, 'cleanup.txt')
        writeFileSync(
          path.join(rootDir, 'runtime-paths.json'),
          JSON.stringify({
            runner: require.resolve('next/dist/experimental/testing/runner'),
            vitest: require.resolve('next/dist/experimental/testing/vitest'),
            mode,
            marker,
          })
        )
        const profile = {
          id: 'unit',
          mode: 'development' as const,
          environment: 'node' as const,
          runtime: 'nodejs' as const,
          bundler: 'turbopack' as const,
        }
        const entry = {
          id: 'unit:list',
          file: path.join(rootDir, 'spec.ts'),
          profile,
        }
        mkdirSync(path.join(rootDir, '__snapshots__'))
        const snapshot = path.join(rootDir, '__snapshots__/spec.ts.snap')
        const snapshotBytes =
          'Existing snapshot syntax must not be evaluated during collection.\n'
        writeFileSync(snapshot, snapshotBytes)
        const events: ResultEvent[] = []
        const completion = execute(
          {
            version: 2,
            kind: 'node',
            entryId: entry.id,
            profile,
            revision: 'collection',
            rootDir,
            entryPath: 'entry.cjs',
            files: ['entry.cjs', 'runtime-paths.json'],
            diagnostics: [],
          },
          {
            runId: 'collection',
            projectDir: rootDir,
            entry,
            setupFiles: [],
            collectOnly: true,
            snapshotUpdateMode: 'none',
            testNamePattern: pattern,
            testTimeout: 1000,
            hookTimeout: 1000,
            fileTimeout: 5000,
            signal: new AbortController().signal,
            onEvent: (event) => events.push(event),
          }
        )
        if (status === 'protocol-error') {
          await expect(completion).rejects.toThrow(
            'Collection worker returned execution facts'
          )
          expect(
            events.some(
              (event) =>
                event.type === 'case-start' || event.type === 'case-end'
            )
          ).toBe(false)
          expect(readFileSync(snapshot, 'utf8')).toBe(snapshotBytes)
          expect(readFileSync(marker, 'utf8')).toBe('restored')
          return
        }
        const result = await completion
        expect(result.status).toBe(status)
        expect(result.collection?.cases.map((test) => test.name)).toEqual(names)
        expect(
          events.some((event) =>
            [
              'case-start',
              'case-end',
              'suite-end',
              'snapshot-summary',
            ].includes(event.type)
          )
        ).toBe(false)
        expect(
          events.find((event) => event.type === 'file-end')
        ).not.toHaveProperty('collection')
        expect(readFileSync(snapshot, 'utf8')).toBe(snapshotBytes)
        expect(readFileSync(marker, 'utf8')).toBe('restored')
      } finally {
        rmSync(rootDir, { recursive: true, force: true })
      }
    }
  )
})

describe('owned unhandled rejection reporting', () => {
  it.each(['body', 'collection', 'disposal', 'primitive', 'caught', 'normal'])(
    'retains completed cases and cleanup for %s rejections',
    async (mode) => {
      const rootDir = mkdtempSync(path.join(tmpdir(), 'next-worker-rejection-'))
      try {
        copyFileSync(
          path.join(__dirname, 'unhandled-entry.cjs'),
          path.join(rootDir, 'entry.cjs')
        )
        const marker = path.join(rootDir, 'cleanup.txt')
        writeFileSync(
          path.join(rootDir, 'runtime-paths.json'),
          JSON.stringify({
            runner: require.resolve('next/dist/experimental/testing/runner'),
            vitest: require.resolve('next/dist/experimental/testing/vitest'),
            mode,
            marker,
          })
        )
        const profile = {
          id: 'unit',
          mode: 'development' as const,
          environment: 'node' as const,
          runtime: 'nodejs' as const,
          bundler: 'turbopack' as const,
        }
        const entry = {
          id: 'unit:rejection',
          file: path.join(rootDir, 'spec.ts'),
          profile,
        }
        writeFileSync(
          entry.file,
          '// Source belongs to the owned worker probe.\n'
        )
        const events: ResultEvent[] = []
        const onSnapshotUpdates = jest.fn(async () => {})
        const result = await execute(
          {
            version: 2,
            kind: 'node',
            entryId: entry.id,
            profile,
            revision: 'rejection',
            rootDir,
            entryPath: 'entry.cjs',
            files: ['entry.cjs', 'runtime-paths.json'],
            diagnostics: [],
          },
          {
            runId: 'rejection',
            projectDir: rootDir,
            entry,
            setupFiles: [],
            updateSnapshots: true,
            testTimeout: 1000,
            hookTimeout: 1000,
            fileTimeout: 5000,
            signal: new AbortController().signal,
            onEvent: (event) => events.push(event),
            onSnapshotUpdates,
          }
        )
        const rejected = mode !== 'caught' && mode !== 'normal'
        expect(result.status).toBe(rejected ? 'failed' : 'passed')
        const cases = events.filter((event) => event.type === 'case-end')
        expect(cases).toMatchObject([
          {
            testName: 'completed body retains its result',
            status: 'passed',
            errors: [],
          },
          { testName: 'successor still runs', status: 'passed', errors: [] },
        ])
        const diagnostics = events.filter(
          (event) => event.type === 'diagnostic'
        )
        if (rejected) {
          expect(diagnostics).toMatchObject([
            {
              diagnostic: {
                phase: 'runtime',
                severity: 'error',
                unhandled: 'rejection',
                message:
                  mode === 'primitive'
                    ? 'owned primitive rejection'
                    : 'owned unhandled rejection',
              },
            },
          ])
          expect(diagnostics).toHaveLength(1)
          expect(onSnapshotUpdates).not.toHaveBeenCalled()
        } else {
          expect(diagnostics).toEqual([])
          expect(onSnapshotUpdates).toHaveBeenCalledTimes(1)
          expect(onSnapshotUpdates.mock.calls[0]).toEqual([
            entry.file,
            [
              expect.objectContaining({
                content: expect.stringContaining(
                  'snapshot remains provisional'
                ),
              }),
            ],
          ])
        }
        expect(
          existsSync(path.join(rootDir, '__snapshots__/spec.ts.snap'))
        ).toBe(false)
        expect(readFileSync(marker, 'utf8')).toBe('restored')
      } finally {
        rmSync(rootDir, { recursive: true, force: true })
      }
    }
  )
})

describe('explicit file worker inspector', () => {
  it.each([
    [undefined, undefined],
    [false, undefined],
    [true, '127.0.0.1:9229'],
    ['0', '127.0.0.1:0'],
    ['127.0.0.1:0', '127.0.0.1:0'],
    ['[::1]:9230', '[::1]:9230'],
  ])('parses the explicit address %s', (input, expected) => {
    expect(parseTestInspectAddress(input)).toBe(expected)
  })

  it.each([
    '',
    '9229x',
    '127.0.0.1:',
    '127.0.0.1:9229extra',
    '-1',
    '65536',
    {},
    [],
  ])('rejects malformed inspector input %s', (input) =>
    expect(() => parseTestInspectAddress(input)).toThrow('inspect must be')
  )

  it.each([undefined, '127.0.0.1:0'])(
    'activates the actual child inspector only for explicit %s',
    async (inspect) => {
      const messages: { inspector: string | null; pid: number }[] = []
      const exit = await runTestProcess(worker, {
        ...options,
        inspect,
        input: 'inspector',
        onMessage: (message) =>
          messages.push(message as (typeof messages)[number]),
      })
      expect(exit).toEqual({ reason: 'exit', code: 0, signal: null })
      expect(messages).toHaveLength(1)
      if (inspect)
        expect(messages[0].inspector).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\//)
      else expect(messages[0].inspector).toBeNull()
      expect(messages[0].pid).not.toBe(process.pid)
      expect(() => process.kill(messages[0].pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    }
  )
})

describe('compiled setup identity', () => {
  const setupFiles = ['/project/first.ts', '/project/second.ts']

  it('accepts an exact ordered setup list and legacy empty artifacts', () => {
    expect(() =>
      assertCompiledSetup({ setupFiles }, [...setupFiles])
    ).not.toThrow()
    expect(() => assertCompiledSetup({}, [])).not.toThrow()
    expect(() => assertCompiledSetup({ setupFiles: [] }, [])).not.toThrow()
  })

  it.each([
    { requested: [] },
    { requested: ['/project/second.ts', '/project/first.ts'] },
    { requested: ['/project/first.ts'] },
    { requested: ['/project/first.ts', '/project/other.ts'] },
  ])('rejects setup mismatch $requested', ({ requested }) => {
    expect(() => assertCompiledSetup({ setupFiles }, requested)).toThrow(
      'Compiled setup files do not match'
    )
  })

  it('rejects requested setup absent from a legacy artifact', () => {
    expect(() => assertCompiledSetup({}, setupFiles)).toThrow(
      'Compiled setup files do not match'
    )
  })
})

describe('Next test process ownership', () => {
  if (process.platform === 'win32') {
    it('rejects execution until Windows process-tree ownership is available', async () => {
      await expect(runTestProcess(worker, options)).rejects.toThrow(
        'Windows execution is not supported yet'
      )
    })
    return
  }

  it('loads relative application files from the supplied project directory', async () => {
    const projectDir = mkdtempSync(path.join(tmpdir(), 'next-testing-project-'))
    try {
      writeFileSync(
        path.join(projectDir, 'relative-data.txt'),
        'application data'
      )
      const messages: unknown[] = []
      await runTestProcess(worker, {
        ...options,
        cwd: projectDir,
        input: 'cwd',
        onMessage(message) {
          messages.push(message)
        },
      })
      expect(messages).toEqual([{ value: 'application data' }])
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it.each(['cancel', 'deadline', 'reporter', 'normal-exit'])(
    'reclaims inherited descendant output pipes on %s',
    async (mode) => {
      const controller = new AbortController()
      const reporterError = new Error('descendant reporter failed')
      let descendant: number | undefined
      let readyAt = performance.now()
      try {
        const completion = runTestProcess(worker, {
          ...options,
          input: mode === 'normal-exit' ? 'descendant-exit' : 'descendant-busy',
          signal: controller.signal,
          timeoutMs: mode === 'deadline' ? 500 : options.timeoutMs,
          onMessage(message) {
            descendant = (message as { descendant: number }).descendant
            readyAt = performance.now()
            if (mode === 'cancel') controller.abort()
            if (mode === 'reporter') throw reporterError
          },
        })
        if (mode === 'reporter') {
          const failure = await completion.catch((error) => error)
          // Show unexpected cleanup errors rather than only an aggregate's
          // generic message, while still requiring exactly the reporter error.
          expect(
            failure instanceof AggregateError ? failure.errors : [failure]
          ).toEqual([reporterError])
        } else {
          const result = await completion
          expect(result.reason).toBe(
            mode === 'cancel'
              ? 'cancelled'
              : mode === 'deadline'
                ? 'timeout'
                : 'exit'
          )
        }
        expect(descendant).toBeDefined()
        expect(performance.now() - readyAt).toBeLessThan(2000)
        await retry(async () => {
          let running = false
          try {
            process.kill(descendant!, 0)
            // A killed orphan can remain a zombie until the container's init
            // reaps it. It cannot execute or retain output pipe descriptors.
            running =
              process.platform !== 'linux' ||
              !readFileSync(`/proc/${descendant}/stat`, 'utf8').includes(') Z ')
          } catch (error) {
            if (
              !['ESRCH', 'ENOENT'].includes(
                (error as NodeJS.ErrnoException).code!
              )
            )
              throw error
          }
          expect(running).toBe(false)
        })
      } finally {
        if (descendant) {
          try {
            process.kill(descendant, 'SIGKILL')
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
          }
        }
      }
    }
  )

  it('does not signal a successfully terminated process group again on child exit', async () => {
    const controller = new AbortController()
    const original = process.kill.bind(process)
    const groups = new Set<number>()
    let descendant: number | undefined
    const signal = jest
      .spyOn(process, 'kill')
      .mockImplementation((pid, value) => {
        if (pid < 0 && value === 'SIGKILL') {
          if (groups.has(pid))
            throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
          const result = original(pid, value)
          groups.add(pid)
          return result
        }
        return original(pid, value)
      })
    try {
      const result = await runTestProcess(worker, {
        ...options,
        input: 'descendant-busy',
        signal: controller.signal,
        onMessage(message) {
          descendant = (message as { descendant: number }).descendant
          controller.abort()
        },
      })
      expect(result.reason).toBe('cancelled')
      expect(groups.size).toBe(1)
      expect(
        signal.mock.calls.filter(
          ([pid, value]) => pid < 0 && value === 'SIGKILL'
        )
      ).toHaveLength(1)
      await retry(async () => {
        let running = false
        try {
          original(descendant!, 0)
          running =
            process.platform !== 'linux' ||
            !readFileSync(`/proc/${descendant}/stat`, 'utf8').includes(') Z ')
        } catch (error) {
          if (!['ESRCH', 'ENOENT'].includes(error.code)) throw error
        }
        expect(running).toBe(false)
      })
    } finally {
      signal.mockRestore()
      if (descendant)
        try {
          original(descendant, 'SIGKILL')
        } catch (error) {
          if (error.code !== 'ESRCH') throw error
        }
    }
  })

  it('retains a failed first group signal even when fallback cleanup succeeds', async () => {
    const controller = new AbortController()
    const original = process.kill.bind(process)
    const failure = Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
    let rejected = false
    let descendant: number | undefined
    const signal = jest
      .spyOn(process, 'kill')
      .mockImplementation((pid, value) => {
        if (pid < 0 && value === 'SIGKILL' && !rejected) {
          rejected = true
          throw failure
        }
        return original(pid, value)
      })
    try {
      await expect(
        runTestProcess(worker, {
          ...options,
          input: 'descendant-busy',
          signal: controller.signal,
          onMessage(message) {
            descendant = (message as { descendant: number }).descendant
            controller.abort()
          },
        })
      ).rejects.toBe(failure)
      expect(rejected).toBe(true)
    } finally {
      signal.mockRestore()
      if (descendant)
        try {
          original(descendant, 'SIGKILL')
        } catch (error) {
          if (error.code !== 'ESRCH') throw error
        }
    }
  })

  it('isolates evaluated globals and modules in parallel and successive files', async () => {
    const messages: { count: number; pid: number }[] = []
    const run = () =>
      runTestProcess(worker, {
        ...options,
        onMessage(message) {
          messages.push(message as (typeof messages)[number])
        },
      })
    const parallel = await Promise.all([run(), run()])
    const successive = await run()
    expect([...parallel, successive].every((result) => result.code === 0)).toBe(
      true
    )
    expect(messages.map((message) => message.count)).toEqual([1, 1, 1])
    expect(new Set(messages.map((message) => message.pid)).size).toBe(3)
  })

  it('bounds pipe disposal for a separately leased detached service', async () => {
    let service: number | undefined
    let readyAt = performance.now()
    try {
      const result = await runTestProcess(worker, {
        ...options,
        input: 'descendant-escaped',
        onMessage(message) {
          service = (message as { descendant: number }).descendant
          readyAt = performance.now()
        },
      })
      expect(result.code).toBe(0)
      expect(performance.now() - readyAt).toBeLessThan(2000)
      expect(service).toBeDefined()
      // An intentionally separate process group is owned by the outer lease,
      // not by the file worker's group. B must close pipes without killing it.
      expect(() => process.kill(service!, 0)).not.toThrow()
    } finally {
      if (service) {
        try {
          process.kill(service, 'SIGKILL')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        }
      }
    }
  })

  it('delivers output before completing', async () => {
    let output = ''
    await runTestProcess(worker, {
      ...options,
      onOutput(_stream, chunk) {
        output += chunk.toString()
      },
    })
    expect(output).toContain('worker output')
  })

  it('allows cooperative cancellation cleanup before resolving', async () => {
    const controller = new AbortController()
    let cleaned = false
    const result = await runTestProcess(worker, {
      ...options,
      input: 'wait',
      signal: controller.signal,
      onMessage(value) {
        const message = value as { ready?: boolean; cleaned?: boolean }
        if (message.ready) controller.abort()
        if (message.cleaned) cleaned = true
      },
    })
    expect(result).toEqual({ code: 0, signal: null, reason: 'cancelled' })
    expect(cleaned).toBe(true)
  })

  it('kills synchronous work which cannot receive cancellation', async () => {
    const controller = new AbortController()
    const result = await runTestProcess(worker, {
      ...options,
      input: 'busy',
      signal: controller.signal,
      onMessage() {
        controller.abort()
      },
    })
    expect(result).toEqual({
      code: null,
      signal: 'SIGKILL',
      reason: 'cancelled',
    })
  })

  it('bounds an uncooperative file with the outer deadline', async () => {
    const result = await runTestProcess(worker, {
      ...options,
      input: 'busy',
      timeoutMs: 500,
    })
    expect(result.reason).toBe('timeout')
    expect(result.signal).toBe('SIGKILL')
  })

  it('reports a worker crash', async () => {
    expect(
      await runTestProcess(worker, { ...options, input: 'crash' })
    ).toEqual({ code: 1, signal: null, reason: 'exit' })
  })

  it('cleans up before rejecting a reporter failure', async () => {
    await expect(
      runTestProcess(worker, {
        ...options,
        input: 'wait',
        onMessage() {
          throw new Error('reporter failed')
        },
      })
    ).rejects.toThrow('reporter failed')
  })

  it('rejects spawn and input serialization failures', async () => {
    await expect(
      runTestProcess(worker, {
        ...options,
        cwd: path.join(__dirname, 'absent'),
      })
    ).rejects.toThrow('ENOENT')
    await expect(
      runTestProcess(worker, { ...options, input() {} })
    ).rejects.toThrow()
  })

  it('does not spawn after cancellation', async () => {
    expect(
      await runTestProcess('/missing-worker', {
        ...options,
        signal: AbortSignal.abort(),
      })
    ).toEqual({ code: null, signal: null, reason: 'cancelled' })
  })

  it('allows a parent lease to own cancellation without a process deadline', async () => {
    const controller = new AbortController()
    const { timeoutMs: _timeoutMs, ...leaseOptions } = options
    const result = await runTestProcess(worker, {
      ...leaseOptions,
      input: 'wait',
      signal: controller.signal,
      onMessage(value) {
        if ((value as { ready?: boolean }).ready) controller.abort()
      },
    })
    expect(result).toEqual({ code: 0, signal: null, reason: 'cancelled' })
  })

  it('keeps an explicit zero deadline distinct from an omitted deadline', async () => {
    const result = await runTestProcess(worker, {
      ...options,
      input: 'wait',
      timeoutMs: 0,
    })
    expect(result.reason).toBe('timeout')
  })

  it('retains reporter and process-group cleanup errors together', async () => {
    const reporterError = new Error('reporter error before cleanup')
    const cleanupError = Object.assign(new Error('group cleanup error'), {
      code: 'EPERM',
    })
    const kill = process.kill.bind(process)
    const spy = jest
      .spyOn(process, 'kill')
      .mockImplementation((pid, signal) => {
        if (pid < 0) throw cleanupError
        return kill(pid, signal)
      })
    try {
      await expect(
        runTestProcess(worker, {
          ...options,
          input: 'busy',
          onMessage() {
            throw reporterError
          },
        })
      ).rejects.toMatchObject({
        name: 'AggregateError',
        errors: [reporterError, cleanupError],
      })
    } finally {
      spy.mockRestore()
    }
  })

  it.each([-1, Infinity, NaN, 2147483648])(
    'rejects invalid deadline %s',
    async (timeoutMs) => {
      await expect(
        runTestProcess(worker, { ...options, timeoutMs })
      ).rejects.toThrow('Invalid test process timeout')
    }
  )
})

describe('immutable artifact source-map lookup', () => {
  let rootDir: string
  const map = {
    version: 3,
    sources: ['original.ts'],
    names: [],
    mappings: 'AAAA',
    sourcesContent: ['throw new Error()'],
  }
  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'next-test-maps-'))
    writeFileSync(path.join(rootDir, 'chunk with space.js'), '')
    writeFileSync(
      path.join(rootDir, 'chunk with space.js.map'),
      JSON.stringify(map)
    )
  })
  afterEach(() => rmSync(rootDir, { recursive: true, force: true }))

  const files = ['chunk with space.js', 'chunk with space.js.map']
  it('loads declared adjacent maps using absolute paths and file URLs', () => {
    const lookup = createArtifactSourceMapLookup({ rootDir, files })
    expect(lookup(path.join(rootDir, files[0]))).toEqual(map)
    expect(lookup(pathToFileURL(path.join(rootDir, files[0])).href)).toEqual(
      map
    )
  })

  it('does not read maps omitted from the immutable closure', () => {
    const lookup = createArtifactSourceMapLookup({
      rootDir,
      files: [files[0]],
    })
    expect(lookup(path.join(rootDir, files[0]))).toBeUndefined()
  })

  it('keeps lookup caches separate between artifact lifetimes', () => {
    const first = createArtifactSourceMapLookup({ rootDir, files })
    expect(first(path.join(rootDir, files[0]))).toEqual(map)
    const updated = { ...map, sources: ['updated.ts'] }
    writeFileSync(path.join(rootDir, files[1]), JSON.stringify(updated))
    const second = createArtifactSourceMapLookup({ rootDir, files })
    expect(first(path.join(rootDir, files[0]))).toEqual(map)
    expect(second(path.join(rootDir, files[0]))).toEqual(updated)
  })

  it('leaves malformed and missing maps unmapped', () => {
    writeFileSync(path.join(rootDir, files[1]), '{not json')
    const malformed = createArtifactSourceMapLookup({ rootDir, files })
    expect(malformed(path.join(rootDir, files[0]))).toBeUndefined()
    rmSync(path.join(rootDir, files[1]))
    const missing = createArtifactSourceMapLookup({ rootDir, files })
    expect(missing(path.join(rootDir, files[0]))).toBeUndefined()
    expect(missing('node:internal/process')).toBeUndefined()
    expect(missing('file:///%')).toBeUndefined()
  })

  it('rejects lexical paths outside the artifact root', () => {
    const lookup = createArtifactSourceMapLookup({
      rootDir,
      files: ['../other.js', '../other.js.map', '/other.js', '/other.js.map'],
    })
    expect(lookup(path.resolve(rootDir, '../other.js'))).toBeUndefined()
    expect(lookup('/other.js')).toBeUndefined()
  })

  it('does not follow a source-map symlink outside its artifact', () => {
    const external = mkdtempSync(path.join(tmpdir(), 'next-external-map-'))
    try {
      const externalMap = path.join(external, 'outside.map')
      writeFileSync(externalMap, JSON.stringify(map))
      rmSync(path.join(rootDir, files[1]))
      symlinkSync(externalMap, path.join(rootDir, files[1]))
      const lookup = createArtifactSourceMapLookup({ rootDir, files })
      expect(lookup(path.join(rootDir, files[0]))).toBeUndefined()
    } finally {
      rmSync(external, { recursive: true, force: true })
    }
  })
})

describe('file cache directory lease', () => {
  it('keeps its directory until the action completes and then removes it', async () => {
    let directory = ''
    let release!: () => void
    let markStarted!: () => void
    const started = new Promise<void>((resolveStarted) => {
      markStarted = resolveStarted
    })
    const pending = new Promise<void>((resolvePending) => {
      release = resolvePending
    })
    const result = withFileCacheDirectory(async (leasedDirectory) => {
      directory = leasedDirectory
      writeFileSync(path.join(directory, 'cache-entry'), 'value')
      markStarted()
      await pending
      expect(readFileSync(path.join(directory, 'cache-entry'), 'utf8')).toBe(
        'value'
      )
      return 'done'
    })
    await started
    expect(existsSync(directory)).toBe(true)
    release()
    expect(await result).toBe('done')
    expect(existsSync(directory)).toBe(false)
  })

  it('removes the directory after a failed action without losing its error', async () => {
    let directory = ''
    const failure = new Error('lease action failed')
    await expect(
      withFileCacheDirectory(async (leasedDirectory) => {
        directory = leasedDirectory
        throw failure
      })
    ).rejects.toBe(failure)
    expect(existsSync(directory)).toBe(false)
  })

  it('allocates independent directories to concurrent file executions', async () => {
    const directories = await Promise.all(
      [1, 2, 3].map(() =>
        withFileCacheDirectory(async (directory) => directory)
      )
    )
    expect(new Set(directories).size).toBe(3)
    expect(directories.every((directory) => !existsSync(directory))).toBe(true)
  })

  if (process.platform !== 'win32') {
    it('retains the lease through cancellation until the child closes', async () => {
      const controller = new AbortController()
      let directory = ''
      const result = await withFileCacheDirectory(async (leasedDirectory) => {
        directory = leasedDirectory
        const exit = await runTestProcess(worker, {
          ...options,
          cwd: directory,
          input: 'busy',
          signal: controller.signal,
          onMessage() {
            expect(existsSync(directory)).toBe(true)
            controller.abort()
          },
        })
        expect(existsSync(directory)).toBe(true)
        return exit
      })
      expect(result.reason).toBe('cancelled')
      expect(existsSync(directory)).toBe(false)
    })
  }
})

describe('versioned compiled artifact profiles', () => {
  const profile = {
    id: 'unit',
    mode: 'development' as const,
    environment: 'node' as const,
    runtime: 'nodejs' as const,
    bundler: 'turbopack' as const,
  }
  const entry = { id: 'unit:file', file: '/project/unit.ts', profile }
  const artifact = {
    version: 2 as const,
    kind: 'node' as const,
    entryId: entry.id,
    profile,
  }
  const malformed = (value: unknown) =>
    value as Parameters<typeof assertArtifactProfile>[0]

  it.each(['node', 'browser', 'rsc'] as const)(
    'accepts matching %s identity',
    (environment) => {
      const selected = { ...profile, environment }
      expect(() =>
        assertArtifactProfile(
          {
            ...artifact,
            kind: environment === 'rsc' ? 'rsc' : 'node',
            profile: selected,
          },
          { ...entry, profile: selected }
        )
      ).not.toThrow()
    }
  )

  it('rejects the previous artifact version rather than reinterpreting it', () => {
    expect(() =>
      assertArtifactProfile(malformed({ ...artifact, version: 1 }), entry)
    ).toThrow('Unsupported compiled test artifact version')
  })

  it('rejects a kind compiled in the wrong environment', () => {
    expect(() =>
      assertArtifactProfile(malformed({ ...artifact, kind: 'rsc' }), entry)
    ).toThrow('kind does not match')
    expect(() =>
      assertArtifactProfile(
        malformed({ ...artifact, profile: { ...profile, environment: 'rsc' } }),
        entry
      )
    ).toThrow('kind does not match')
  })

  it('rejects a compiled entry belonging to another requested profile', () => {
    expect(() =>
      assertArtifactProfile(artifact, {
        ...entry,
        profile: { ...profile, mode: 'production' },
      })
    ).toThrow('identity or profile mismatch')
    expect(() =>
      assertArtifactProfile(artifact, { ...entry, id: 'other:file' })
    ).toThrow('identity or profile mismatch')
  })
})

describe('late file failure reporting', () => {
  it('marks a caught late failure synchronously and reports it once', async () => {
    const report = jest.fn(async () => {})
    const sink = createLateFailureSink(report)
    const error = new Error('original closed scope')
    sink.report(error)
    sink.report(error)
    expect(sink.failed).toBe(true)
    expect(sink.has(error)).toBe(true)
    await sink.flush()
    expect(report).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(error)
  })

  it('drains failures arriving while a diagnostic is being sent', async () => {
    const first = new Error('first closed scope')
    const second = new Error('second closed scope')
    const received: Error[] = []
    const sink = createLateFailureSink(async (error) => {
      received.push(error)
      if (error === first) sink.report(second)
    })
    sink.report(first)
    await sink.flush()
    expect(received).toEqual([first, second])
  })

  it('observes rejected diagnostic sends without losing the file failure', async () => {
    const transportError = new Error('IPC send failed')
    const sink = createLateFailureSink(async () => {
      throw transportError
    })
    sink.report(new Error('late caught assertion'))
    await expect(sink.flush()).rejects.toBe(transportError)
    expect(sink.failed).toBe(true)
  })
})

describe('browser attempt attachment paths', () => {
  const root = path.join(tmpdir(), 'retained-browser-output')
  it('keeps arbitrary identifiers within the retained parent directory', () => {
    const directory = browserOutputDirectory(
      root,
      '../run',
      '/other/project',
      '../../attempt'
    )
    expect(path.dirname(directory)).toBe(root)
    expect(path.basename(directory)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('separates attempts and preserves identifier boundaries', () => {
    const first = browserOutputDirectory(root, 'run', 'entry', 'attempt-0')
    expect(browserOutputDirectory(root, 'run', 'entry', 'attempt-0')).toBe(
      first
    )
    expect(browserOutputDirectory(root, 'run', 'entry', 'attempt-1')).not.toBe(
      first
    )
    expect(browserOutputDirectory(root, 'a\0b', 'c', 'd')).not.toBe(
      browserOutputDirectory(root, 'a', 'b\0c', 'd')
    )
  })

  it('rejects relative attachment roots', () => {
    expect(() =>
      browserOutputDirectory('../output', 'run', 'entry', 'attempt')
    ).toThrow('must be absolute')
  })
})

describe('persistent worker lease prerequisite', () => {
  const profile = {
    id: 'lease',
    mode: 'development' as const,
    environment: 'node' as const,
    runtime: 'nodejs' as const,
    bundler: 'turbopack' as const,
  }
  const fileInput = (rootDir: string, id: string): WorkerInput => {
    mkdirSync(path.join(rootDir, id + '-cache'), { recursive: true })
    writeFileSync(path.join(rootDir, id + '-cache', 'retained'), id)
    return {
      artifact: {
        version: 2,
        kind: 'node',
        entryId: id,
        profile,
        revision: 'cohort',
        rootDir,
        entryPath: id + '.cjs',
        files: [id + '.cjs', 'shared.cjs'],
        diagnostics: [],
      },
      options: {
        runId: 'lease',
        projectDir: rootDir,
        entry: { id, file: path.join(rootDir, id + '.test.ts'), profile },
        setupFiles: [],
        fileTimeout: 500,
        testTimeout: 100,
        hookTimeout: 100,
        updateSnapshots: true,
      },
      cacheScope: {
        type: 'file',
        directory: path.join(rootDir, id + '-cache'),
      },
    }
  }
  const setup = (mode = 'normal') => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'next-worker-lease-'))
    writeFileSync(
      path.join(rootDir, 'shared.cjs'),
      'module.exports = {token:42}'
    )
    let pid: number | undefined
    const events: ResultEvent[] = []
    const released: string[] = []
    const start = () =>
      createTestWorkerLease(path.join(__dirname, 'lease-worker.cjs'), {
        cwd: rootDir,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          NEXT_LEASE_CONTROL: mode,
        },
        input: {
          version: 1,
          leaseId: 'lease',
          runId: 'lease',
          rootDir,
          revision: 'cohort',
          profile,
        },
        startupTimeoutMs: mode === 'startup-busy' ? 150 : 5000,
        finishTimeoutMs: mode === 'cleanup-busy' ? 150 : 5000,
        shutdownGraceMs: 25,
        onEvent(event) {
          events.push(event)
          if (mode === 'event-failure') throw new Error('event consumer failed')
        },
        onOutput(_stream, chunk) {
          const match = chunk.toString().match(/LEASE_PID=(\d+)/)
          if (match) pid = Number(match[1])
          if (mode === 'output-failure')
            throw new Error('output consumer failed')
        },
        async release() {
          if (pid)
            expect(() => process.kill(pid!, 0)).toThrow(
              expect.objectContaining({ code: 'ESRCH' })
            )
          released.push('cohort')
        },
      })
    return { rootDir, events, released, start }
  }

  it('reuses one actual process and cached helper while withholding all completions until final cleanup', async () => {
    const fixture = setup()
    let lease: Awaited<ReturnType<typeof createTestWorkerLease>> | undefined
    try {
      lease = await fixture.start()
      expect(
        await lease.enqueue(fileInput(fixture.rootDir, 'first'), async () => {
          rmSync(path.join(fixture.rootDir, 'first-cache'), {
            recursive: true,
            force: true,
          })
          fixture.released.push('first')
        })
      ).toBeUndefined()
      expect(
        await lease.enqueue(fileInput(fixture.rootDir, 'second'), async () => {
          rmSync(path.join(fixture.rootDir, 'second-cache'), {
            recursive: true,
            force: true,
          })
          fixture.released.push('second')
        })
      ).toBeUndefined()
      expect(fixture.released).toEqual([])
      expect(
        existsSync(path.join(fixture.rootDir, 'first-cache', 'retained'))
      ).toBe(true)
      expect(
        existsSync(path.join(fixture.rootDir, 'second-cache', 'retained'))
      ).toBe(true)
      const outputs = fixture.events
        .filter((event) => event.type === 'output')
        .map((event) => JSON.parse(event.text))
      expect(outputs.map((output) => output.count)).toEqual([1, 2])
      expect(outputs[0].pid).toBe(outputs[1].pid)
      const result = await lease.finish()
      expect(result.map((completion) => completion.result.entryId)).toEqual([
        'first',
        'second',
      ])
      expect(result.map((completion) => completion.result.status)).toEqual([
        'passed',
        'passed',
      ])
      expect(result.map((completion) => completion.snapshotUpdates)).toEqual([
        [],
        [],
      ])
      expect(fixture.released).toEqual(['second', 'first', 'cohort'])
      expect(existsSync(path.join(fixture.rootDir, 'first-cache'))).toBe(false)
      expect(existsSync(path.join(fixture.rootDir, 'second-cache'))).toBe(false)
      expect(
        readFileSync(path.join(fixture.rootDir, 'worker-cleanup'), 'utf8')
      ).toBe('finish\n')
      expect(await lease.finish()).toBe(result)
    } finally {
      await lease?.abort(new Error('test cleanup')).catch(() => {})
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })

  it.each([
    'forged',
    'event-failure',
    'file-poisoned',
    'duplicate',
    'crash-after-file',
    'late-first',
    'premature-worker',
    'cleanup-failure',
    'cleanup-busy',
    'deadline',
    'reset-module',
  ])('vetoes every provisional file completion after %s', async (mode) => {
    const fixture = setup(mode)
    let lease: Awaited<ReturnType<typeof createTestWorkerLease>> | undefined
    try {
      lease = await fixture.start()
      const requests = [
        lease.enqueue(fileInput(fixture.rootDir, 'first'), async () => {
          rmSync(path.join(fixture.rootDir, 'first-cache'), {
            recursive: true,
            force: true,
          })
          fixture.released.push('first')
        }),
      ]
      if (mode === 'late-first' || mode === 'reset-module')
        requests.push(
          lease.enqueue(fileInput(fixture.rootDir, 'second'), async () => {
            rmSync(path.join(fixture.rootDir, 'second-cache'), {
              recursive: true,
              force: true,
            })
            fixture.released.push('second')
          })
        )
      await Promise.allSettled(requests)
      await expect(lease.finish()).rejects.toThrow()
      expect(fixture.released.at(-1)).toBe('cohort')
    } finally {
      await lease?.abort(new Error('test cleanup')).catch(() => {})
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })

  it.each(['after-finish', 'after-poison', 'release-failure'])(
    'drains an unsubmitted cache when enqueue refuses %s',
    async (mode) => {
      const fixture = setup()
      let lease: Awaited<ReturnType<typeof createTestWorkerLease>> | undefined
      let closing: Promise<unknown> | undefined
      try {
        lease = await fixture.start()
        if (mode === 'after-poison') {
          closing = lease.abort(new Error('lease retired'))
          void closing.catch(() => {})
        } else await lease.finish()
        const input = fileInput(fixture.rootDir, 'rejected')
        const rejected = lease.enqueue(input, async () => {
          rmSync(input.cacheScope.directory, { recursive: true, force: true })
          fixture.released.push('rejected')
          if (mode === 'release-failure')
            throw new Error('unsubmitted cache cleanup failed')
        })
        if (mode === 'release-failure')
          await expect(rejected).rejects.toMatchObject({
            errors: [
              expect.objectContaining({
                message: 'Persistent worker lease is closing.',
              }),
              expect.objectContaining({
                message: 'unsubmitted cache cleanup failed',
              }),
            ],
          })
        else
          await expect(rejected).rejects.toThrow(
            'Persistent worker lease is closing.'
          )
        expect(existsSync(input.cacheScope.directory)).toBe(false)
        expect(fixture.released).toContain('rejected')
        await closing?.catch(() => {})
      } finally {
        await lease?.abort(new Error('test cleanup')).catch(() => {})
        rmSync(fixture.rootDir, { recursive: true, force: true })
      }
    }
  )

  it('closes owned resources if a request cannot cross the IPC boundary', async () => {
    const fixture = setup()
    let lease: Awaited<ReturnType<typeof createTestWorkerLease>> | undefined
    try {
      lease = await fixture.start()
      const input = fileInput(fixture.rootDir, 'first')
      input.options.provide = { uncloneable() {} }
      await expect(
        lease.enqueue(input, async () => {
          rmSync(path.join(fixture.rootDir, 'first-cache'), {
            recursive: true,
            force: true,
          })
          fixture.released.push('first')
        })
      ).rejects.toThrow()
      await expect(lease.finish()).rejects.toThrow()
      expect(fixture.released).toEqual(['first', 'cohort'])
    } finally {
      await lease?.abort(new Error('test cleanup')).catch(() => {})
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })

  it('reclaims descendants before releasing retained resources', async () => {
    const fixture = setup('descendant')
    let lease: Awaited<ReturnType<typeof createTestWorkerLease>> | undefined
    try {
      lease = await fixture.start()
      await lease.enqueue(fileInput(fixture.rootDir, 'first'), async () => {
        rmSync(path.join(fixture.rootDir, 'first-cache'), {
          recursive: true,
          force: true,
        })
      })
      const event = fixture.events.find((event) => event.type === 'output')!
      if (event.type !== 'output') throw new Error('Missing transport evidence')
      const { descendant } = JSON.parse(event.text)
      expect(descendant).toBeGreaterThan(0)
      await lease.finish()
      expect(() => process.kill(descendant, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      await lease?.abort(new Error('test cleanup')).catch(() => {})
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })

  it('retires the whole lease when a queued file is cancelled', async () => {
    const fixture = setup()
    let lease: Awaited<ReturnType<typeof createTestWorkerLease>> | undefined
    const controller = new AbortController()
    try {
      lease = await fixture.start()
      const first = lease.enqueue(
        fileInput(fixture.rootDir, 'first'),
        async () => {
          rmSync(path.join(fixture.rootDir, 'first-cache'), {
            recursive: true,
            force: true,
          })
          fixture.released.push('first')
        }
      )
      const second = lease.enqueue(
        fileInput(fixture.rootDir, 'second'),
        async () => {
          rmSync(path.join(fixture.rootDir, 'second-cache'), {
            recursive: true,
            force: true,
          })
          fixture.released.push('second')
        },
        controller.signal
      )
      controller.abort(new Error('queued file cancelled'))
      await Promise.allSettled([first, second])
      await expect(lease.finish()).rejects.toThrow('queued file cancelled')
      expect(fixture.released).toEqual(['second', 'first', 'cohort'])
      expect(existsSync(path.join(fixture.rootDir, 'first-cache'))).toBe(false)
      expect(existsSync(path.join(fixture.rootDir, 'second-cache'))).toBe(false)
    } finally {
      await lease?.abort(new Error('test cleanup')).catch(() => {})
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })

  it('retains output callback failure until process and resource cleanup finish', async () => {
    const fixture = setup('output-failure')
    try {
      await expect(fixture.start()).rejects.toThrow('output consumer failed')
      expect(fixture.released).toEqual(['cohort'])
    } finally {
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })

  it('bounds startup without publishing a lease and still releases resources', async () => {
    const fixture = setup('startup-busy')
    try {
      await expect(fixture.start()).rejects.toThrow(
        'startup exceeded its deadline'
      )
      expect(fixture.released).toEqual(['cohort'])
    } finally {
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })

  it('vetoes provisional results and drains resources after a parent cleanup failure', async () => {
    const fixture = setup()
    let lease: Awaited<ReturnType<typeof createTestWorkerLease>> | undefined
    try {
      lease = await fixture.start()
      await lease.enqueue(fileInput(fixture.rootDir, 'first'), async () => {
        rmSync(path.join(fixture.rootDir, 'first-cache'), {
          recursive: true,
          force: true,
        })
        fixture.released.push('first')
        throw new Error('retained file cache cleanup failed')
      })
      await expect(lease.finish()).rejects.toThrow(
        'retained file cache cleanup failed'
      )
      expect(fixture.released).toEqual(['first', 'cohort'])
    } finally {
      await lease?.abort(new Error('test cleanup')).catch(() => {})
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })

  it('rejects separate compiler revisions instead of treating a reused PID as a shared module graph', async () => {
    const fixture = setup()
    let lease: Awaited<ReturnType<typeof createTestWorkerLease>> | undefined
    try {
      lease = await fixture.start()
      const first = fileInput(fixture.rootDir, 'first')
      const second = fileInput(fixture.rootDir, 'second')
      second.artifact.rootDir += '-different'
      await lease.enqueue(first, async () => {
        rmSync(path.join(fixture.rootDir, 'first-cache'), {
          recursive: true,
          force: true,
        })
        fixture.released.push('first')
      })
      await expect(
        lease.enqueue(second, async () => {
          rmSync(path.join(fixture.rootDir, 'second-cache'), {
            recursive: true,
            force: true,
          })
          fixture.released.push('second')
        })
      ).rejects.toThrow('immutable compiler cohort')
      await expect(lease.finish()).rejects.toThrow('immutable compiler cohort')
      expect(fixture.released).toEqual(['second', 'first', 'cohort'])
      expect(existsSync(path.join(fixture.rootDir, 'first-cache'))).toBe(false)
      expect(existsSync(path.join(fixture.rootDir, 'second-cache'))).toBe(false)
    } finally {
      await lease?.abort(new Error('test cleanup')).catch(() => {})
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })
  const finalInput = (rootDir: string, id: string, index: number) => {
    const input = fileInput(rootDir, id)
    if (input.artifact.kind !== 'node')
      throw new Error('Expected Node control artifact')
    input.artifact.cohort = {
      version: 1,
      index,
      metadataPath: 'cohort.json',
      outputs: input.artifact.files.map((file) => ({
        path: file,
        sha256: '0'.repeat(64),
      })),
      entries: [
        { entryId: 'first', file: 'first.test.ts', sourceHash: '0'.repeat(64) },
        {
          entryId: 'second',
          file: 'second.test.ts',
          sourceHash: '0'.repeat(64),
        },
      ],
    }
    return input
  }
  it('attaches final shared snapshots only after actual finish and retained cache cleanup', async () => {
    const fixture = setup('final-snapshots')
    let lease: Awaited<ReturnType<typeof createTestWorkerLease>> | undefined
    try {
      lease = await fixture.start()
      await lease.enqueue(finalInput(fixture.rootDir, 'first', 0), async () => {
        fixture.released.push('first')
      })
      await lease.enqueue(
        finalInput(fixture.rootDir, 'second', 1),
        async () => {
          fixture.released.push('second')
        }
      )
      expect(fixture.released).toEqual([])
      expect(existsSync(path.join(fixture.rootDir, 'first.snap'))).toBe(false)
      const completions = await lease.finish()
      expect(
        completions.map((completion) => completion.snapshotUpdates)
      ).toEqual([
        [
          {
            path: path.join(fixture.rootDir, 'first.snap'),
            content: 'staged',
            previousContent: null,
          },
        ],
        [
          {
            path: path.join(fixture.rootDir, 'second.snap'),
            content: 'staged',
            previousContent: null,
          },
        ],
      ])
      expect(fixture.released).toEqual(['second', 'first', 'cohort'])
      expect(existsSync(path.join(fixture.rootDir, 'first.snap'))).toBe(false)
    } finally {
      await lease?.abort(new Error('cleanup')).catch(() => {})
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })
  it.each([
    'final-forged',
    'final-duplicate',
    'final-missing',
    'final-bytes',
    'final-crash',
  ])('vetoes final shared snapshot data after %s', async (mode) => {
    const fixture = setup(mode)
    let lease: Awaited<ReturnType<typeof createTestWorkerLease>> | undefined
    try {
      lease = await fixture.start()
      await lease.enqueue(
        finalInput(fixture.rootDir, 'first', 0),
        async () => {}
      )
      await expect(lease.finish()).rejects.toThrow()
      expect(existsSync(path.join(fixture.rootDir, 'first.snap'))).toBe(false)
      expect(fixture.released).toEqual(['cohort'])
    } finally {
      await lease?.abort(new Error('cleanup')).catch(() => {})
      rmSync(fixture.rootDir, { recursive: true, force: true })
    }
  })
})

describe('actual shared compiler cohort child host', () => {
  const profile = {
    id: 'cohort-host',
    mode: 'development',
    environment: 'node',
    runtime: 'nodejs',
    bundler: 'turbopack',
  } as const
  async function setupHost(
    mode:
      | 'original'
      | 'snapshots'
      | 'cleanup-failure'
      | 'late-error'
      | 'late-primitive' = 'original'
  ) {
    const project = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'next-cohort-host-'))
    )
    const rootDir = path.join(project, 'artifact')
    mkdirSync(rootDir)
    const names =
      mode === 'original'
        ? ['contract.case.mjs', 'second.case.mjs']
        : ['first.test.mjs', 'second.test.mjs']
    const runtime = {
      runner: require.resolve('next/dist/experimental/testing/runner'),
      facade: require.resolve('next/dist/experimental/testing/vitest'),
    }
    mkdirSync(path.join(project, 'node_modules/vitest'), { recursive: true })
    writeFileSync(
      path.join(project, 'node_modules/vitest/package.json'),
      JSON.stringify({ type: 'module', exports: './index.mjs' })
    )
    writeFileSync(
      path.join(project, 'node_modules/vitest/index.mjs'),
      `import facade from ${JSON.stringify(pathToFileURL(runtime.facade).href)}; export const {test,expect,beforeAll,afterAll}=facade;`
    )
    if (mode === 'original') {
      const original = path.join(
        process.cwd(),
        'test/unit/app-dir/next-testing-stable-release-gaps/fixtures/worker-lifetime-across-files'
      )
      for (const name of [
        ...names,
        'worker-helper.mjs',
        'worker-creations.txt',
      ])
        copyFileSync(path.join(original, name), path.join(project, name))
    } else {
      writeFileSync(
        path.join(project, 'worker-helper.mjs'),
        `import {test} from 'vitest'; import {appendFileSync} from 'node:fs';
        export let release; export const gate = new Promise(r=>release=r);
        export const owned=test.extend({value:[async ({},use)=>{appendFileSync('worker-created','1');await use(1);appendFileSync('worker-disposed','1');${mode === 'cleanup-failure' ? "throw new Error('worker cleanup sentinel')" : ''}},{scope:'worker'}]});`
      )
      writeFileSync(
        path.join(project, names[0]),
        `import {owned,gate} from './worker-helper.mjs'; import {expect} from 'vitest';
        owned('first',({value})=>{expect(value).toBe(1);${mode.startsWith('late-') ? `void gate.then(()=>{throw ${mode === 'late-error' ? "new Error('closed first rejection')" : "'closed first primitive'"}});` : "expect('first staged').toMatchSnapshot();"}});`
      )
      writeFileSync(
        path.join(project, names[1]),
        `import {owned,release} from './worker-helper.mjs'; import {expect} from 'vitest';
        owned('second',async ({value})=>{expect(value).toBe(1);${mode.startsWith('late-') ? 'release();await new Promise(setImmediate);await new Promise(setImmediate);' : "expect('second staged').toMatchSnapshot();"}});`
      )
    }
    copyFileSync(
      path.join(__dirname, 'cohort-entry.cjs'),
      path.join(rootDir, 'entry.cjs')
    )
    writeFileSync(
      path.join(rootDir, 'runtime-paths.json'),
      JSON.stringify({ ...runtime, project, files: names })
    )
    writeFileSync(
      path.join(rootDir, 'cohort.json'),
      JSON.stringify({ cohort: { version: 1, files: names } })
    )
    writeFileSync(
      path.join(rootDir, 'helper.cjs'),
      'exports.validateIndex=index=>{if(!Number.isInteger(index))throw new Error("invalid index")}'
    )
    const emitted = [
      'entry.cjs',
      'runtime-paths.json',
      'cohort.json',
      'helper.cjs',
    ]
    const outputs = emitted.map((file) => ({
      path: file,
      sha256: createHash('sha256')
        .update(readFileSync(path.join(rootDir, file)))
        .digest('hex'),
    }))
    const entries = names.map((name, index) => ({
      entryId: index ? 'second' : 'first',
      file: name,
      sourceHash: createHash('sha256')
        .update(readFileSync(path.join(project, name)))
        .digest('hex'),
    }))
    const inputs: WorkerInput[] = entries.map((input, index) => {
      const directory = path.join(project, `cache-${index}`)
      mkdirSync(directory)
      writeFileSync(path.join(directory, 'retained'), '1')
      return {
        artifact: {
          version: 2,
          kind: 'node',
          profile,
          entryId: input.entryId,
          revision: 'shared',
          sourceHash: input.sourceHash,
          rootDir,
          entryPath: 'entry.cjs',
          files: [...emitted],
          diagnostics: [],
          setupFiles: [],
          snapshotSerializers: [],
          cohort: {
            version: 1,
            index,
            metadataPath: 'cohort.json',
            entries,
            outputs,
          },
        },
        options: {
          runId: 'host',
          projectDir: project,
          entry: {
            id: input.entryId,
            file: path.join(project, input.file),
            profile,
          },
          setupFiles: [],
          updateSnapshots: mode !== 'original',
          snapshotUpdateMode: mode === 'original' ? 'none' : 'all',
          fileTimeout: 3000,
          testTimeout: 1000,
          hookTimeout: 1000,
        },
        cacheScope: { type: 'file', directory },
      }
    })
    const events: ResultEvent[] = [],
      released: string[] = [],
      output: string[] = []
    const lease = await createTestWorkerLease(
      require.resolve('next/dist/experimental/testing/execution/cohort-worker'),
      {
        cwd: project,
        env: { ...process.env, NODE_ENV: 'development' },
        input: {
          version: 1,
          leaseId: randomUUID(),
          runId: 'host',
          rootDir,
          revision: 'shared',
          profile,
        },
        startupTimeoutMs: 5000,
        finishTimeoutMs: 5000,
        shutdownGraceMs: 25,
        onEvent(event) {
          events.push(event)
        },
        onOutput(_, bytes) {
          output.push(bytes.toString())
        },
        async release() {
          released.push('cohort')
        },
      }
    )
    return { project, rootDir, inputs, events, released, output, lease }
  }
  it('runs both unchanged original cross-file specs in one actual child with one cached helper and owner', async () => {
    const fixture = await setupHost()
    try {
      for (const input of fixture.inputs)
        await fixture.lease.enqueue(input, async () => {
          expect(
            existsSync(path.join(input.cacheScope.directory, 'retained'))
          ).toBe(true)
          rmSync(input.cacheScope.directory, { recursive: true })
          fixture.released.push(input.artifact.entryId)
        })
      expect(fixture.released).toEqual([])
      const result = await fixture.lease.finish()
      expect(result.map((item) => item.result.status)).toEqual([
        'passed',
        'passed',
      ])
      expect(
        readFileSync(path.join(fixture.project, 'worker-creations.txt'), 'utf8')
      ).toBe('1')
      expect(
        fixture.events
          .filter((event) => event.type === 'case-end')
          .map((event) => event.status)
      ).toEqual(['passed', 'passed'])
      expect(fixture.released).toEqual(['second', 'first', 'cohort'])
    } finally {
      await fixture.lease.abort(new Error('cleanup')).catch(() => {})
      rmSync(fixture.project, { recursive: true, force: true })
    }
  })
  it('holds staged snapshot bytes through actual shared fixture teardown and process/cache cleanup', async () => {
    const fixture = await setupHost('snapshots')
    try {
      for (const input of fixture.inputs)
        await fixture.lease.enqueue(input, async () => {
          fixture.released.push(input.artifact.entryId)
        })
      expect(existsSync(path.join(fixture.project, 'worker-disposed'))).toBe(
        false
      )
      expect(fixture.released).toEqual([])
      const result = await fixture.lease.finish()
      expect(result.map((item) => item.result.status)).toEqual([
        'passed',
        'passed',
      ])
      expect(result.map((item) => item.snapshotUpdates?.length)).toEqual([1, 1])
      expect(
        readFileSync(path.join(fixture.project, 'worker-created'), 'utf8')
      ).toBe('1')
      expect(
        readFileSync(path.join(fixture.project, 'worker-disposed'), 'utf8')
      ).toBe('1')
      expect(existsSync(path.join(fixture.project, '__snapshots__'))).toBe(
        false
      )
      expect(fixture.released).toEqual(['second', 'first', 'cohort'])
    } finally {
      await fixture.lease.abort(new Error('cleanup')).catch(() => {})
      rmSync(fixture.project, { recursive: true, force: true })
    }
  })
  it.each(['cleanup-failure', 'late-error', 'late-primitive'] as const)(
    'vetoes all provisional shared results and snapshots after %s',
    async (mode) => {
      const fixture = await setupHost(mode)
      try {
        for (const input of fixture.inputs)
          await fixture.lease.enqueue(input, async () => {}).catch(() => {})
        await expect(fixture.lease.finish()).rejects.toThrow()
        expect(existsSync(path.join(fixture.project, '__snapshots__'))).toBe(
          false
        )
        if (mode.startsWith('late-')) {
          const rejections = fixture.events.flatMap((event) =>
            event.type === 'diagnostic' &&
            event.diagnostic.unhandled === 'rejection'
              ? [event]
              : []
          )
          expect(rejections.map((event) => event.entryId)).toEqual(['first'])
          expect(rejections[0]).toMatchObject({
            diagnostic: {
              message: expect.stringContaining(
                mode === 'late-error'
                  ? 'closed first rejection'
                  : 'closed first primitive'
              ),
            },
          })
        }
      } finally {
        await fixture.lease.abort(new Error('cleanup')).catch(() => {})
        rmSync(fixture.project, { recursive: true, force: true })
      }
    }
  )
  function compiledCohort(inputs: WorkerInput[]) {
    return {
      version: 1 as const,
      artifacts: inputs.map((input) => {
        if (input.artifact.kind !== 'node')
          throw new Error('Expected Node cohort')
        return input.artifact
      }),
    }
  }
  it.each([
    'range',
    'duplicate source',
    'native order',
    'missing emission',
    'changed source',
    'escaping path',
    'split closure',
    'entry bytes',
    'helper bytes',
  ] as const)(
    'rejects shared cohort %s before evaluating application modules',
    async (invalid) => {
      const fixture = await setupHost('snapshots')
      try {
        const cohort = compiledCohort(fixture.inputs)
        if (invalid === 'range') cohort.artifacts[1].cohort!.index = 2
        if (invalid === 'duplicate source')
          cohort.artifacts[0].cohort!.entries = [
            cohort.artifacts[0].cohort!.entries[0],
            cohort.artifacts[0].cohort!.entries[0],
          ]
        if (invalid === 'native order')
          writeFileSync(
            path.join(fixture.rootDir, 'cohort.json'),
            JSON.stringify({
              cohort: {
                version: 1,
                files: ['second.test.mjs', 'first.test.mjs'],
              },
            })
          )
        if (invalid === 'missing emission')
          rmSync(path.join(fixture.rootDir, 'entry.cjs'))
        if (invalid === 'changed source')
          writeFileSync(fixture.inputs[1].options.entry.file, '// changed')
        if (invalid === 'escaping path')
          cohort.artifacts[0].files.push('../outside.cjs')
        if (invalid === 'entry bytes')
          writeFileSync(
            path.join(fixture.rootDir, 'entry.cjs'),
            '// tampered entry'
          )
        if (invalid === 'helper bytes')
          writeFileSync(
            path.join(fixture.rootDir, 'helper.cjs'),
            '// tampered helper'
          )
        if (invalid === 'split closure') {
          cohort.artifacts[1].entryPath = 'other.cjs'
          cohort.artifacts[1].files = [
            ...cohort.artifacts[1].files,
            'other.cjs',
          ]
        }
        await expect(
          validateCompiledTestCohort(
            cohort,
            fixture.inputs.map((input) => input.options.entry),
            fixture.project
          )
        ).rejects.toThrow()
        expect(existsSync(path.join(fixture.project, 'worker-created'))).toBe(
          false
        )
      } finally {
        await fixture.lease.abort(new Error('cleanup')).catch(() => {})
        rmSync(fixture.project, { recursive: true, force: true })
      }
    }
  )
  it('rejects a changed source in post-exit validation before staged snapshot publication', async () => {
    const fixture = await setupHost('snapshots')
    try {
      const cohort = compiledCohort(fixture.inputs),
        entries = fixture.inputs.map((input) => input.options.entry)
      await validateCompiledTestCohort(cohort, entries, fixture.project)
      for (const input of fixture.inputs)
        await fixture.lease.enqueue(input, async () => {})
      const result = await fixture.lease.finish()
      expect(result.map((item) => item.snapshotUpdates?.length)).toEqual([1, 1])
      writeFileSync(entries[1].file, '// changed after actual process close')
      await expect(
        validateCompiledTestCohort(cohort, entries, fixture.project)
      ).rejects.toThrow('source changed')
      expect(existsSync(path.join(fixture.project, '__snapshots__'))).toBe(
        false
      )
    } finally {
      await fixture.lease.abort(new Error('cleanup')).catch(() => {})
      rmSync(fixture.project, { recursive: true, force: true })
    }
  })
  it('rejects changed emitted helper bytes after actual child exit before snapshot publication', async () => {
    const fixture = await setupHost('snapshots')
    try {
      const cohort = compiledCohort(fixture.inputs),
        entries = fixture.inputs.map((input) => input.options.entry)
      await validateCompiledTestCohort(cohort, entries, fixture.project)
      for (const input of fixture.inputs)
        await fixture.lease.enqueue(input, async () => {})
      const result = await fixture.lease.finish()
      expect(result.map((item) => item.snapshotUpdates?.length)).toEqual([1, 1])
      writeFileSync(
        path.join(fixture.rootDir, 'helper.cjs'),
        '// mutated after exit'
      )
      await expect(
        validateCompiledTestCohort(cohort, entries, fixture.project)
      ).rejects.toThrow('emitted file bytes changed')
      expect(existsSync(path.join(fixture.project, '__snapshots__'))).toBe(
        false
      )
    } finally {
      await fixture.lease.abort(new Error('cleanup')).catch(() => {})
      rmSync(fixture.project, { recursive: true, force: true })
    }
  })
})

describe('owned custom execution environment', () => {
  function probe(root: string, code: string) {
    return JSON.parse(
      execFileSync(
        process.execPath,
        [
          '-e',
          code,
          require.resolve(
            'next/dist/experimental/testing/environments/runtime'
          ),
          root,
        ],
        { encoding: 'utf8' }
      )
    )
  }

  it('populates a real Edge provider while retaining pinned SSR host globals', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'next-edge-environment-'))
    try {
      expect(
        probe(
          root,
          `(async()=>{
        const {openTestEnvironment}=require(process.argv[1]);
        const host={Response,Request,fetch,setTimeout,Event,Uint8Array};
        const owned=await openTestEnvironment(process.argv[2],{name:'edge-runtime'});
        const setup={edge:globalThis.EdgeRuntime,response:new Response('edge').status,fetchEvent:typeof FetchEvent,urlPattern:new URLPattern({pathname:'/edge/:id'}).test('https://example.com/edge/42'),hostKept:Object.entries(host).every(([key,value])=>globalThis[key]===value),aliases:window===globalThis&&self===globalThis&&top===globalThis&&parent===globalThis};
        await owned.dispose(); await owned.dispose();
        console.log(JSON.stringify({setup,removed:!('EdgeRuntime'in globalThis)&&!('FetchEvent'in globalThis)&&!('window'in globalThis),hostRestored:Object.entries(host).every(([key,value])=>globalThis[key]===value)}));
      })().catch(error=>{console.error(error);process.exitCode=1})`
        )
      ).toEqual({
        setup: {
          edge: 'edge-runtime',
          response: 200,
          fetchEvent: 'function',
          urlPattern: true,
          hostKept: true,
          aliases: true,
        },
        removed: true,
        hostRestored: true,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('retires real Edge event callbacks and closes retained registration handles', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'next-edge-events-'))
    try {
      expect(
        probe(
          root,
          `(async()=>{
        const {openTestEnvironment}=require(process.argv[1]); let callbacks=0;
        const before={error:process.listenerCount('uncaughtException'),rejection:process.listenerCount('unhandledRejection')};
        const owned=await openTestEnvironment(process.argv[2],{name:'edge-runtime'});
        const add=addEventListener,remove=removeEventListener,listener=()=>callbacks++;
        add('error',listener); add('unhandledrejection',listener);
        process.emit('uncaughtException',new Error('before disposal'));process.emit('unhandledRejection',new Error('before disposal'),Promise.resolve());
        const active=callbacks;
        await owned.dispose();
        process.emit('uncaughtException',new Error('after disposal'));process.emit('unhandledRejection',new Error('after disposal'),Promise.resolve());
        let closed=0;for(const api of [add,remove])try{api('error',listener)}catch(error){if(error.message.includes('disposed'))closed++}
        console.log(JSON.stringify({active,retired:callbacks===active,closed,inertProviderHooks:{error:process.listenerCount('uncaughtException')-before.error,rejection:process.listenerCount('unhandledRejection')-before.rejection},restored:!('addEventListener'in globalThis)&&!('removeEventListener'in globalThis)}));
      })().catch(error=>{console.error(error);process.exitCode=1})`
        )
      ).toEqual({
        active: 2,
        retired: true,
        closed: 2,
        inertProviderHooks: { error: 1, rejection: 1 },
        restored: true,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('retires Edge callbacks even when global restoration fails', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'next-edge-cleanup-failure-'))
    try {
      expect(
        probe(
          root,
          `(async()=>{const {openTestEnvironment}=require(process.argv[1]);let callbacks=0;const owned=await openTestEnvironment(process.argv[2],{name:'edge-runtime'});addEventListener('error',()=>callbacks++);Object.defineProperty(globalThis,'edgeRestorationBlock',{value:true,configurable:false});let error;try{await owned.dispose()}catch(value){error=value.message}process.emit('uncaughtException',new Error('after failed restoration'));console.log(JSON.stringify({error,retired:callbacks===0,providerGlobalsRemoved:!('EdgeRuntime'in globalThis)}))})().catch(error=>{console.error(error);process.exitCode=1})`
        )
      ).toEqual({
        error: 'Test environment global restoration failed.',
        retired: true,
        providerGlobalsRemoved: true,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects unqualified Edge VM options before exposing provider globals', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'next-edge-options-'))
    try {
      expect(
        probe(
          root,
          `(async()=>{const {openTestEnvironment}=require(process.argv[1]);let rejected=false;try{await openTestEnvironment(process.argv[2],{name:'edge-runtime',options:{initialCode:'globalThis.unqualifiedEdgeCode=true'}})}catch(error){rejected=error.message.includes('options are not supported')}console.log(JSON.stringify({rejected,removed:!('EdgeRuntime'in globalThis)&&!('unqualifiedEdgeCode'in globalThis)}))})().catch(error=>{console.error(error);process.exitCode=1})`
        )
      ).toEqual({ rejected: true, removed: true })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('awaits real custom teardown and restores global descriptors when it fails', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'next-custom-environment-'))
    try {
      writeFileSync(
        path.join(root, 'environment.mjs'),
        `export default { name: 'real', viteEnvironment: 'ssr', async setup(global, options) {
        await Promise.resolve(); Object.defineProperty(global, 'originalRealmValue', { configurable:true, value: options.value });
        global.realmAdded = 42;
        return { async teardown() { await Promise.resolve(); global.realmTeardowns = (global.realmTeardowns || 0) + 1; throw new Error('real teardown failure') } }
      } }`
      )
      expect(
        probe(
          root,
          `(async()=>{
        const {openTestEnvironment}=require(process.argv[1]); let reads=0;const get=()=>{reads++;return 7};
        Object.defineProperty(globalThis,'originalRealmValue',{configurable:true,get});
        const owned=await openTestEnvironment(process.argv[2],{name:'./environment.mjs',options:{value:19}});
        const setup=globalThis.originalRealmValue===19&&globalThis.realmAdded===42;let error;
        try{await owned.dispose()}catch(value){error=value.message}await owned.dispose().catch(()=>{});
        console.log(JSON.stringify({setup,error,restored:Object.getOwnPropertyDescriptor(globalThis,'originalRealmValue').get===get,reads,removed:!('realmAdded'in globalThis)&&!('realmTeardowns'in globalThis)}));
      })().catch(error=>{console.error(error);process.exitCode=1})`
        )
      ).toEqual({
        setup: true,
        error: 'real teardown failure',
        restored: true,
        reads: 0,
        removed: true,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('restores additions after actual setup failure', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'next-custom-environment-failure-')
    )
    try {
      writeFileSync(
        path.join(root, 'environment.mjs'),
        `export default { name:'broken',viteEnvironment:'ssr',setup(global){global.failedRealm=42;throw new Error('real setup failure')} }`
      )
      expect(
        probe(
          root,
          `(async()=>{const {openTestEnvironment}=require(process.argv[1]);let error;try{await openTestEnvironment(process.argv[2],{name:'./environment.mjs'})}catch(value){error=value.message}console.log(JSON.stringify({error,removed:!('failedRealm'in globalThis)}))})().catch(error=>{console.error(error);process.exitCode=1})`
        )
      ).toEqual({ error: 'real setup failure', removed: true })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires a provider from the consumer project', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'next-custom-environment-missing-')
    )
    try {
      const result = probe(
        root,
        `(async()=>{const {openTestEnvironment}=require(process.argv[1]);let error;try{await openTestEnvironment(process.argv[2],{name:'missing-owned-provider'})}catch(value){error=value.message}console.log(JSON.stringify({error,removed:!('window'in globalThis)}))})().catch(error=>{console.error(error);process.exitCode=1})`
      )
      expect(result.error).toContain(
        'vitest-environment-missing-owned-provider'
      )
      expect(result.error).toContain(root)
      expect(result.removed).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('parent API with the actual shared child host', () => {
  function parentFixture(
    mode: 'original' | 'snapshots' | 'cleanup-failure' = 'original'
  ) {
    const project = realpathSync(
      mkdtempSync(path.join(tmpdir(), 'next-cohort-parent-'))
    )
    const rootDir = path.join(project, 'artifact')
    const caches = path.join(project, 'caches')
    mkdirSync(rootDir)
    mkdirSync(caches)
    const profile = {
      id: 'cohort-parent',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    } as const
    const names =
      mode === 'original'
        ? ['contract.case.mjs', 'second.case.mjs']
        : ['first.test.mjs', 'second.test.mjs']
    const runtime = {
      runner: require.resolve('next/dist/experimental/testing/runner'),
      facade: require.resolve('next/dist/experimental/testing/vitest'),
    }
    mkdirSync(path.join(project, 'node_modules/vitest'), { recursive: true })
    writeFileSync(
      path.join(project, 'node_modules/vitest/package.json'),
      JSON.stringify({ type: 'module', exports: './index.mjs' })
    )
    writeFileSync(
      path.join(project, 'node_modules/vitest/index.mjs'),
      `import facade from ${JSON.stringify(pathToFileURL(runtime.facade).href)};import {writeFileSync} from 'node:fs';writeFileSync('worker-pid',String(process.pid));export const {test,expect,beforeAll,afterAll}=facade;`
    )
    if (mode === 'original') {
      const original = path.join(
        process.cwd(),
        'test/unit/app-dir/next-testing-stable-release-gaps/fixtures/worker-lifetime-across-files'
      )
      for (const name of [
        ...names,
        'worker-helper.mjs',
        'worker-creations.txt',
      ])
        copyFileSync(path.join(original, name), path.join(project, name))
    } else {
      writeFileSync(
        path.join(project, 'worker-helper.mjs'),
        `import {test} from 'vitest';import {appendFileSync} from 'node:fs';export const owned=test.extend({value:[async ({},use)=>{appendFileSync('worker-created','1');await use(1);appendFileSync('worker-disposed','1');${mode === 'cleanup-failure' ? "throw new Error('parent worker cleanup sentinel')" : ''}},{scope:'worker'}]});`
      )
      for (const [index, name] of names.entries())
        writeFileSync(
          path.join(project, name),
          `import {owned} from './worker-helper.mjs';import {expect} from 'vitest';owned('${index ? 'second' : 'first'}',({value})=>{expect(value).toBe(1);expect('${index ? 'second' : 'first'} staged').toMatchSnapshot()});`
        )
    }
    copyFileSync(
      path.join(__dirname, 'cohort-entry.cjs'),
      path.join(rootDir, 'entry.cjs')
    )
    writeFileSync(
      path.join(rootDir, 'runtime-paths.json'),
      JSON.stringify({ ...runtime, project, files: names })
    )
    writeFileSync(
      path.join(rootDir, 'cohort.json'),
      JSON.stringify({ cohort: { version: 1, files: names } })
    )
    writeFileSync(
      path.join(rootDir, 'helper.cjs'),
      'exports.validateIndex=index=>{if(!Number.isInteger(index))throw new Error("invalid index")}'
    )
    const files = [
      'entry.cjs',
      'runtime-paths.json',
      'cohort.json',
      'helper.cjs',
    ]
    const outputs = files.map((file) => ({
      path: file,
      sha256: createHash('sha256')
        .update(readFileSync(path.join(rootDir, file)))
        .digest('hex'),
    }))
    const entries = names.map((name, index) => ({
      entryId: index ? 'second' : 'first',
      file: name,
      sourceHash: createHash('sha256')
        .update(readFileSync(path.join(project, name)))
        .digest('hex'),
    }))
    const controller = new AbortController()
    const events: ResultEvent[][] = [[], []]
    const options: ExecuteTestOptions[] = entries.map((input, index) => ({
      runId: 'parent-api',
      projectDir: project,
      entry: {
        id: input.entryId,
        file: path.join(project, input.file),
        profile,
      },
      setupFiles: [],
      snapshotUpdateMode: mode === 'original' ? 'none' : 'all',
      updateSnapshots: mode !== 'original',
      fileTimeout: 5000,
      testTimeout: 1000,
      hookTimeout: 1000,
      signal: controller.signal,
      onEvent: (event) => events[index].push(event),
    }))
    const cohort: CompiledTestCohort = {
      version: 1,
      artifacts: entries.map((input, index) => ({
        version: 2,
        kind: 'node',
        profile,
        entryId: input.entryId,
        revision: 'parent-api',
        sourceHash: input.sourceHash,
        rootDir,
        entryPath: 'entry.cjs',
        files,
        diagnostics: [],
        setupFiles: [],
        snapshotSerializers: [],
        cohort: {
          version: 1,
          index,
          metadataPath: 'cohort.json',
          entries,
          outputs,
        },
      })),
    }
    const retainedDirectories: string[] = []
    const cacheDirectories = () =>
      retainedDirectories.filter((directory) => existsSync(directory))
    const snapshotFiles = names.map((name) =>
      path.join(project, '__snapshots__', `${name}.snap`)
    )
    const assertExited = () => {
      const pid = Number(readFileSync(path.join(project, 'worker-pid'), 'utf8'))
      expect(() => process.kill(pid, 0)).toThrow()
    }
    async function run(execution: typeof executeCohort = executeCohort) {
      const createDirectory = fileSystem.mkdtemp
      const observeDirectory = jest
        .spyOn(fileSystem, 'mkdtemp')
        .mockImplementation(async (prefix) => {
          const directory = await createDirectory(prefix)
          if (path.basename(directory).startsWith('next-test-cache-'))
            retainedDirectories.push(directory)
          return directory
        })
      try {
        return await execution(cohort, options)
      } finally {
        observeDirectory.mockRestore()
      }
    }
    function cleanup() {
      for (const directory of retainedDirectories)
        rmSync(directory, { recursive: true, force: true })
      rmSync(project, { recursive: true, force: true })
    }
    return {
      project,
      rootDir,
      caches,
      cohort,
      options,
      controller,
      events,
      cacheDirectories,
      snapshotFiles,
      assertExited,
      run,
      cleanup,
    }
  }

  it('routes distinct per-file callbacks and retains both caches until the actual original worker exits', async () => {
    const fixture = parentFixture()
    const retained: number[] = []
    try {
      for (const [index, value] of fixture.options.entries())
        value.onEvent = (event) => {
          fixture.events[index].push(event)
          if (event.type === 'case-end')
            retained.push(fixture.cacheDirectories().length)
          if (event.type === 'file-end') {
            expect(fixture.cacheDirectories()).toEqual([])
            fixture.assertExited()
          }
        }
      const result = await fixture.run()
      expect(result.map((value) => value.status)).toEqual(['passed', 'passed'])
      expect(
        fixture.events.map((events) =>
          events
            .filter((event) => event.type === 'file-start')
            .map((event) => event.entry.id)
        )
      ).toEqual([['first'], ['second']])
      expect(
        fixture.events.map((events) =>
          events
            .filter((event) => event.type === 'file-end')
            .map((event) => event.entryId)
        )
      ).toEqual([['first'], ['second']])
      expect(retained).toEqual([1, 2])
      expect(fixture.cacheDirectories()).toEqual([])
      expect(
        readFileSync(path.join(fixture.project, 'worker-creations.txt'), 'utf8')
      ).toBe('1')
    } finally {
      fixture.cleanup()
    }
  })

  it('publishes actual snapshot bytes only after worker fixture disposal, process exit and cache removal', async () => {
    const fixture = parentFixture('snapshots')
    try {
      for (const [index, value] of fixture.options.entries())
        value.onEvent = (event) => {
          fixture.events[index].push(event)
          if (event.type === 'case-end')
            expect(
              fixture.snapshotFiles.every((file) => !existsSync(file))
            ).toBe(true)
          if (event.type === 'file-end') {
            expect(fixture.cacheDirectories()).toEqual([])
            expect(
              readFileSync(
                path.join(fixture.project, 'worker-disposed'),
                'utf8'
              )
            ).toBe('1')
            fixture.assertExited()
            expect(
              readFileSync(fixture.snapshotFiles[index], 'utf8')
            ).toContain(`${index ? 'second' : 'first'} staged`)
          }
        }
      expect((await fixture.run()).map((value) => value.status)).toEqual([
        'passed',
        'passed',
      ])
      expect(
        readFileSync(path.join(fixture.project, 'worker-created'), 'utf8')
      ).toBe('1')
      expect(fixture.snapshotFiles.every((file) => existsSync(file))).toBe(true)
    } finally {
      fixture.cleanup()
    }
  })

  it.each(['source-edit', 'output-edit', 'cleanup-failure', 'cancel'] as const)(
    'vetoes snapshots and reclaims actual caches after %s',
    async (mode) => {
      const fixture = parentFixture(
        mode === 'cleanup-failure' ? 'cleanup-failure' : 'snapshots'
      )
      const before =
        '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\n'
      let provisional = 0
      let edited: string | undefined
      try {
        mkdirSync(path.dirname(fixture.snapshotFiles[0]), { recursive: true })
        for (const file of fixture.snapshotFiles) writeFileSync(file, before)
        fixture.options.forEach((value, index) => {
          value.onEvent = (event) => {
            fixture.events[index].push(event)
            if (event.type !== 'case-end') return
            expect(event.status).toBe('passed')
            provisional++
            if (index !== 1) return
            if (mode === 'source-edit') {
              edited =
                readFileSync(fixture.options[0].entry.file, 'utf8') +
                '\n// user source change\n'
              writeFileSync(fixture.options[0].entry.file, edited)
            } else if (mode === 'output-edit') {
              const output = path.join(fixture.rootDir, 'entry.cjs')
              edited =
                readFileSync(output, 'utf8') + '\n// emitted byte change\n'
              writeFileSync(output, edited)
            } else if (mode === 'cancel')
              fixture.controller.abort(
                new Error('parent cancellation sentinel')
              )
          }
        })
        await expect(fixture.run()).rejects.toThrow()
        expect(provisional).toBe(2)
        expect(fixture.cacheDirectories()).toEqual([])
        fixture.assertExited()
        for (const file of fixture.snapshotFiles)
          expect(readFileSync(file, 'utf8')).toBe(before)
        expect(
          fixture.events.flat().filter((event) => event.type === 'file-end')
        ).toEqual([])
        if (mode === 'source-edit')
          expect(readFileSync(fixture.options[0].entry.file, 'utf8')).toBe(
            edited
          )
        if (mode === 'output-edit')
          expect(
            readFileSync(path.join(fixture.rootDir, 'entry.cjs'), 'utf8')
          ).toBe(edited)
        if (mode === 'cleanup-failure')
          expect(
            fixture.events
              .flat()
              .some(
                (event) =>
                  (event.type === 'diagnostic' &&
                    event.diagnostic.message.includes(
                      'parent worker cleanup sentinel'
                    )) ||
                  (event.type === 'output' &&
                    event.text.includes('parent worker cleanup sentinel'))
              )
          ).toBe(true)
      } finally {
        fixture.cleanup()
      }
    }
  )

  it.each(['source-edit', 'output-edit', 'cancel'] as const)(
    'certifies actual parent broker closure without publishing after %s',
    async (mode) => {
      const fixture = parentFixture('snapshots')
      const messages: ExecutionBrokerResponse[] = []
      let client: ReturnType<typeof createExecutionBrokerClient>
      const publications: string[] = []
      const host = createExecutionBrokerHost({
        signal: new AbortController().signal,
        allowCohorts: true,
        async onSnapshotUpdates(_, file) {
          publications.push(file)
        },
        async send(message) {
          messages.push(message)
          client.handle(message)
        },
      })
      client = createExecutionBrokerClient({
        allowCohorts: true,
        async send(message) {
          host.handle(message)
        },
      })
      const before =
        '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\n'
      try {
        mkdirSync(path.dirname(fixture.snapshotFiles[0]), { recursive: true })
        for (const file of fixture.snapshotFiles) writeFileSync(file, before)
        fixture.options.forEach((value, index) => {
          value.onEvent = (event) => {
            fixture.events[index].push(event)
            if (index !== 1 || event.type !== 'case-end') return
            if (mode === 'cancel')
              fixture.controller.abort(
                new Error('certified cancellation sentinel')
              )
            else {
              const file =
                mode === 'source-edit'
                  ? fixture.options[0].entry.file
                  : path.join(fixture.rootDir, 'entry.cjs')
              writeFileSync(
                file,
                readFileSync(file, 'utf8') + '\n// parent edit control\n'
              )
            }
          }
        })
        const failure = await fixture.run(client.executeCohort).then(
          () => undefined,
          (error) => error
        )
        expect(isCohortExecutionClosedError(failure)).toBe(true)
        if (mode === 'cancel') {
          expect(failure.cancelled).toBe(true)
          expect(failure.cause).toBe(fixture.controller.signal.reason)
        }
        await expect(host.close()).resolves.toBeUndefined()
        expect(host.ownershipClosed).toBe(true)
        expect(
          messages.some(
            (message) =>
              message.action === 'error' && message.ownershipClosed === true
          )
        ).toBe(true)
        expect(publications).toEqual([])
        expect(
          fixture.events
            .flat()
            .filter(
              (event) => event.type === 'case-end' && event.status === 'passed'
            )
        ).toHaveLength(2)
        expect(
          fixture.events.flat().filter((event) => event.type === 'file-end')
        ).toEqual([])
        expect(fixture.cacheDirectories()).toEqual([])
        fixture.assertExited()
        for (const file of fixture.snapshotFiles)
          expect(readFileSync(file, 'utf8')).toBe(before)
      } finally {
        client.disconnect(new Error('test cleanup'))
        await host.close().catch(() => {})
        fixture.cleanup()
      }
    }
  )

  it('retains uncertain parent ownership when an actual cache release fails', async () => {
    const fixture = parentFixture('snapshots')
    const messages: ExecutionBrokerResponse[] = []
    let client: ReturnType<typeof createExecutionBrokerClient>
    let publications = 0
    const host = createExecutionBrokerHost({
      signal: new AbortController().signal,
      allowCohorts: true,
      async onSnapshotUpdates() {
        publications++
      },
      async send(message) {
        messages.push(message)
        client.handle(message)
      },
    })
    client = createExecutionBrokerClient({
      allowCohorts: true,
      async send(message) {
        host.handle(message)
      },
    })
    const remove = fileSystem.rm
    let retained: string | undefined
    const failingRelease = jest
      .spyOn(fileSystem, 'rm')
      .mockImplementation(async (file, settings) => {
        if (
          typeof file === 'string' &&
          path.basename(file).startsWith('next-test-cache-') &&
          !retained
        ) {
          retained = file
          throw new Error('actual parent cache release sentinel')
        }
        return remove(file, settings)
      })
    try {
      const failure = await fixture.run(client.executeCohort).then(
        () => undefined,
        (error) => error
      )
      expect(isCohortExecutionClosedError(failure)).toBe(false)
      await expect(host.close()).rejects.toThrow()
      expect(host.ownershipClosed).toBe(false)
      expect(
        messages.some(
          (message) =>
            message.action === 'error' && message.ownershipClosed === true
        )
      ).toBe(false)
      expect(publications).toBe(0)
      expect(retained).toBeDefined()
      expect(existsSync(retained!)).toBe(true)
      expect(fixture.snapshotFiles.every((file) => !existsSync(file))).toBe(
        true
      )
      fixture.assertExited()
    } finally {
      failingRelease.mockRestore()
      client.disconnect(new Error('test cleanup'))
      await host.close().catch(() => {})
      fixture.cleanup()
    }
  })
})

describe('compiler-owned cache activation in the real file worker', () => {
  it.each([
    { marked: true, expose: true, tracker: true, status: 'passed' },
    { marked: false, expose: true, tracker: true, status: 'passed' },
    { marked: true, expose: false, tracker: true, status: 'failed' },
    { marked: true, expose: true, tracker: false, status: 'failed' },
    {
      marked: true,
      expose: true,
      tracker: true,
      status: 'failed',
      collectOnly: true,
    },
  ])(
    'binds marker=$marked initializer=$expose tracker=$tracker collection=$collectOnly',
    async ({ marked, expose, tracker, status, collectOnly }) => {
      const rootDir = mkdtempSync(
        path.join(tmpdir(), 'next-worker-cache-marker-')
      )
      try {
        copyFileSync(
          path.join(__dirname, 'cache-marker-entry.cjs'),
          path.join(rootDir, 'entry.cjs')
        )
        const trace = path.join(rootDir, 'trace.txt')
        writeFileSync(
          path.join(rootDir, 'runtime-paths.json'),
          JSON.stringify({
            runner: require.resolve('next/dist/experimental/testing/runner'),
            vitest: require.resolve('next/dist/experimental/testing/vitest'),
            moduleCache: require.resolve(
              'next/dist/experimental/testing/mocking/module-cache'
            ),
            imports: require.resolve(
              'next/dist/experimental/testing/runner/imports'
            ),
            marked,
            expose,
            tracker,
            trace,
          })
        )
        const profile = {
          id: 'unit',
          mode: 'development' as const,
          environment: 'node' as const,
          runtime: 'nodejs' as const,
          bundler: 'turbopack' as const,
        }
        const entry = {
          id: 'unit:cache',
          file: path.join(rootDir, 'spec.ts'),
          profile,
        }
        const input: WorkerInput = {
          artifact: {
            version: 2,
            kind: 'node',
            entryId: entry.id,
            profile,
            revision: 'cache-marker-protocol',
            rootDir,
            entryPath: 'entry.cjs',
            files: ['entry.cjs', 'runtime-paths.json'],
            diagnostics: [],
            ...(marked ? { moduleCache: { version: 1 as const } } : {}),
          },
          options: {
            runId: 'cache-marker',
            projectDir: rootDir,
            entry,
            setupFiles: [],
            collectOnly,
            testTimeout: 1000,
            hookTimeout: 1000,
            fileTimeout: 5000,
          },
          cacheScope: { type: 'file', directory: path.join(rootDir, 'cache') },
        }
        const messages: WorkerMessage[] = []
        const exit = await runTestProcess(
          require.resolve('next/dist/experimental/testing/execution/worker'),
          {
            ...options,
            cwd: rootDir,
            input,
            onMessage(message) {
              messages.push(message as WorkerMessage)
            },
          }
        )
        expect(exit.code).toBe(0)
        expect(messages.find((message) => message.type === 'complete')).toEqual(
          { type: 'complete', result: expect.objectContaining({ status }) }
        )
        const phases = existsSync(trace)
          ? readFileSync(trace, 'utf8').trim().split('\n')
          : []
        if (collectOnly) {
          expect(phases).toEqual([])
          expect(JSON.stringify(messages)).toContain(
            'Unsupported compiled module cache reset profile'
          )
        } else if (status === 'passed')
          expect(phases).toEqual(
            marked
              ? [
                  'bootstrap',
                  'cache-initialize',
                  'collect',
                  'case',
                  'cache-dispose',
                  'imports-dispose',
                ]
              : ['bootstrap', 'collect', 'case', 'imports-dispose']
          )
        else {
          expect(phases).toEqual([
            'bootstrap',
            ...(tracker ? ['imports-dispose'] : []),
          ])
          expect(JSON.stringify(messages)).toContain(
            'missing its native manifest or import tracker'
          )
        }
      } finally {
        rmSync(rootDir, { recursive: true, force: true })
      }
    }
  )
})

describe('RSC mock worker admission', () => {
  it.each([
    'route',
    'setup',
    'serializers',
    'realm',
    'coverage',
    'reset',
    'in-source',
    'production',
  ] as const)(
    'rejects unsupported RSC mock %s before evaluating an entry',
    async (mode) => {
      const rootDir = mkdtempSync(
        path.join(tmpdir(), 'next-rsc-mock-admission-')
      )
      try {
        const sentinel = path.join(rootDir, 'unexpected-evaluation')
        writeFileSync(
          path.join(rootDir, 'entry.cjs'),
          `require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'unexpected evaluation')`
        )
        const profile = {
          id: 'rsc',
          environment: 'rsc' as const,
          mode:
            mode === 'production'
              ? ('production' as const)
              : ('development' as const),
          runtime: 'nodejs' as const,
          bundler: 'turbopack' as const,
          ...(mode === 'route' ? { route: '/reference' } : {}),
        }
        const setup = mode === 'setup' ? [path.join(rootDir, 'setup.ts')] : []
        const serializers =
          mode === 'serializers' ? [path.join(rootDir, 'serializer.ts')] : []
        const entry = {
          id: 'rsc:admission',
          file: path.join(rootDir, 'spec.ts'),
          profile,
          ...(mode === 'realm'
            ? { executionEnvironment: { name: 'node' } }
            : {}),
          ...(mode === 'in-source' ? { inSource: true as const } : {}),
        }
        const artifact = {
          version: 2 as const,
          kind: 'rsc' as const,
          entryId: entry.id,
          profile,
          revision: 'admission',
          rootDir,
          entryPath: 'entry.cjs',
          files: ['entry.cjs'],
          diagnostics: [],
          setupFiles: setup,
          snapshotSerializers: serializers,
          manifestPage: '/__next_test__/admission/page',
          manifests: {
            clientReference: 'client.js',
            serverActions: 'actions.json',
          },
          moduleMocking: { version: 1 as const },
          ...(mode === 'reset' ? { moduleCache: { version: 1 } } : {}),
        }
        const input: WorkerInput = {
          artifact,
          options: {
            runId: 'rsc-mock-admission',
            projectDir: rootDir,
            entry,
            setupFiles: setup,
            snapshotSerializers: serializers,
            testTimeout: 1000,
            hookTimeout: 1000,
            fileTimeout: 5000,
            ...(mode === 'coverage'
              ? {
                  coverage: { version: 1 as const, kind: 'node-line' as const },
                }
              : {}),
          },
          cacheScope: { type: 'file', directory: path.join(rootDir, 'cache') },
        }
        const messages: WorkerMessage[] = []
        const exit = await runTestProcess(
          require.resolve('next/dist/experimental/testing/execution/worker'),
          {
            ...options,
            cwd: rootDir,
            env: { ...process.env, NODE_ENV: profile.mode },
            input,
            onMessage(message) {
              messages.push(message as WorkerMessage)
            },
          }
        )
        expect(exit.code).toBe(0)
        expect(messages.find((message) => message.type === 'complete')).toEqual(
          {
            type: 'complete',
            result: expect.objectContaining({ status: 'failed' }),
            ...(mode === 'coverage'
              ? {
                  coverage: expect.objectContaining({
                    version: 1,
                    entryId: entry.id,
                    runId: input.options.runId,
                    complete: false,
                    error: expect.objectContaining({
                      message: 'Test coverage collection did not start',
                    }),
                  }),
                }
              : {}),
          }
        )
        expect(existsSync(sentinel)).toBe(false)
        expect(JSON.stringify(messages)).toContain(
          mode === 'realm'
            ? 'require a Node compiler profile'
            : 'Unsupported compiled module mocking profile or version'
        )
      } finally {
        rmSync(rootDir, { recursive: true, force: true })
      }
    }
  )
  it.each([
    'version',
    'setup',
    'serializers',
    'realm',
    'coverage',
    'in-source',
    'inspector',
  ] as const)(
    'rejects unsupported CommonJS named-import spy %s before entry evaluation',
    async (mode) => {
      const rootDir = mkdtempSync(
        path.join(tmpdir(), 'next-cjs-spy-admission-')
      )
      try {
        const sentinel = path.join(rootDir, 'unexpected-evaluation')
        writeFileSync(
          path.join(rootDir, 'entry.cjs'),
          `require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'unexpected evaluation')`
        )
        const profile = {
          id: 'node',
          environment: 'node' as const,
          mode: 'development' as const,
          runtime: 'nodejs' as const,
          bundler: 'turbopack' as const,
        }
        const setup = mode === 'setup' ? [path.join(rootDir, 'setup.ts')] : []
        const serializers =
          mode === 'serializers' ? [path.join(rootDir, 'serializer.ts')] : []
        const entry = {
          id: 'node:cjs-spy-admission',
          file: path.join(rootDir, 'spec.ts'),
          profile,
          ...(mode === 'realm'
            ? { executionEnvironment: { name: 'node' } }
            : {}),
          ...(mode === 'in-source' ? { inSource: true as const } : {}),
        }
        const input: WorkerInput = {
          artifact: {
            version: 2,
            kind: 'node',
            entryId: entry.id,
            profile,
            revision: 'admission',
            rootDir,
            entryPath: 'entry.cjs',
            files: ['entry.cjs'],
            diagnostics: [],
            setupFiles: setup,
            snapshotSerializers: serializers,
            moduleMocking: {
              version: 1,
              cjsNamedSpy: (mode === 'version' ? 2 : 1) as 1,
            },
          },
          options: {
            runId: 'cjs-spy-admission',
            projectDir: rootDir,
            entry,
            setupFiles: setup,
            snapshotSerializers: serializers,
            testTimeout: 1000,
            hookTimeout: 1000,
            fileTimeout: 5000,
            ...(mode === 'coverage'
              ? {
                  coverage: { version: 1 as const, kind: 'node-line' as const },
                }
              : {}),
            ...(mode === 'inspector' ? { inspect: '127.0.0.1:0' } : {}),
          },
          cacheScope: { type: 'file', directory: path.join(rootDir, 'cache') },
        }
        const messages: WorkerMessage[] = []
        const exit = await runTestProcess(
          require.resolve('next/dist/experimental/testing/execution/worker'),
          {
            ...options,
            cwd: rootDir,
            env: { ...process.env, NODE_ENV: profile.mode },
            input,
            onMessage(message) {
              messages.push(message as WorkerMessage)
            },
          }
        )
        expect(exit.code).toBe(0)
        expect(messages.find((message) => message.type === 'complete')).toEqual(
          expect.objectContaining({
            result: expect.objectContaining({ status: 'failed' }),
          })
        )
        expect(existsSync(sentinel)).toBe(false)
        expect(JSON.stringify(messages)).toContain(
          'Unsupported CommonJS named-import spy execution profile'
        )
      } finally {
        rmSync(rootDir, { recursive: true, force: true })
      }
    }
  )
})

describe('production factory mock ownership in the real file worker', () => {
  it.each([
    'normal',
    'missing-marker',
    'invalid-native-marker',
    'changed-output-before',
    'changed-source-before',
    'source-edit-in-dispose',
    'output-edit-in-dispose',
    'output-link-in-dispose',
    'cleanup-error',
  ] as const)('handles %s without publishing unowned results', async (mode) => {
    const rootDir = mkdtempSync(
      path.join(tmpdir(), 'next-production-mock-owner-')
    )
    try {
      const source = path.join(rootDir, 'spec.ts')
      const sentinel = path.join(rootDir, 'evaluated')
      const disposed = path.join(rootDir, 'disposed')
      writeFileSync(source, '// controlled worker protocol source')
      const entryFile = path.join(rootDir, 'entry.cjs')
      const mutation =
        mode === 'source-edit-in-dispose'
          ? `fs.writeFileSync(${JSON.stringify(source)}, 'edited after registry teardown')`
          : mode === 'output-edit-in-dispose'
            ? `fs.appendFileSync(__filename, '\\n// edited after registry teardown')`
            : mode === 'output-link-in-dispose'
              ? `const p = require('node:path'); const original = p.join(__dirname, 'runtime-paths.json'); fs.renameSync(original, original + '.retained'); fs.symlinkSync(original + '.retained', original)`
              : mode === 'cleanup-error'
                ? `throw new Error('controlled production registry cleanup failure')`
                : ''
      writeFileSync(
        entryFile,
        `const fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(sentinel)}, 'evaluated');\n` +
          readFileSync(path.join(__dirname, 'mock-marker-entry.cjs'), 'utf8') +
          `\nconst initialize = exports.mockTesting.initializeModuleMocking; exports.mockTesting.initializeModuleMocking = (...args) => { const binding = initialize(...args); return { ...binding, async dispose() { await binding.dispose(); fs.writeFileSync(${JSON.stringify(disposed)}, 'disposed'); ${mutation} } } };\n`
      )
      writeFileSync(
        path.join(rootDir, 'runtime-paths.json'),
        JSON.stringify({
          runner: require.resolve('next/dist/experimental/testing/runner'),
          mocking: require.resolve(
            'next/dist/experimental/testing/mocking/runtime'
          ),
          marked: true,
          expose: true,
        })
      )
      const digest = (file: string) =>
        createHash('sha256')
          .update(readFileSync(path.join(rootDir, file)))
          .digest('hex')
      const sourceHash = digest('spec.ts')
      writeFileSync(
        path.join(rootDir, 'source.json'),
        JSON.stringify({ version: 1, sha256: sourceHash })
      )
      writeFileSync(
        path.join(rootDir, 'metadata.json'),
        JSON.stringify({
          moduleMocking: {
            version: 1,
            productionStaticFactory: mode === 'invalid-native-marker' ? 2 : 1,
          },
        })
      )
      const files = [
        'entry.cjs',
        'runtime-paths.json',
        'source.json',
        'metadata.json',
      ]
      const profile = {
        id: 'production-owner',
        mode: 'production' as const,
        environment: 'node' as const,
        runtime: 'nodejs' as const,
        bundler: 'turbopack' as const,
      }
      const entry = { id: 'production:owner', file: source, profile }
      const artifact = {
        version: 2 as const,
        kind: 'node' as const,
        entryId: entry.id,
        profile,
        revision: 'production-owner',
        sourceHash,
        rootDir,
        entryPath: 'entry.cjs',
        files,
        diagnostics: [],
        setupFiles: [],
        snapshotSerializers: [],
        moduleMocking: {
          version: 1 as const,
          ...(mode === 'missing-marker'
            ? {}
            : {
                productionStaticFactory: {
                  version: 1 as const,
                  metadata: {
                    path: 'metadata.json',
                    sha256: digest('metadata.json'),
                  },
                  sourceMetadata: {
                    path: 'source.json',
                    sha256: digest('source.json'),
                  },
                  outputs: files.map((file) => ({
                    path: file,
                    sha256: digest(file),
                  })),
                },
              }),
        },
      }
      if (mode === 'changed-output-before')
        writeFileSync(path.join(rootDir, 'runtime-paths.json'), '{}')
      if (mode === 'changed-source-before')
        writeFileSync(source, '// edited before execution')
      const events: ResultEvent[] = []
      const result = await execute(artifact, {
        runId: 'production-owner',
        entry,
        projectDir: rootDir,
        signal: new AbortController().signal,
        setupFiles: [],
        snapshotSerializers: [],
        updateSnapshots: false,
        snapshotUpdateMode: 'none',
        testTimeout: 1000,
        hookTimeout: 1000,
        fileTimeout: 5000,
        onEvent(event) {
          events.push(event)
        },
      })
      expect(result.status).toBe(mode === 'normal' ? 'passed' : 'failed')
      const before = [
        'missing-marker',
        'invalid-native-marker',
        'changed-output-before',
        'changed-source-before',
      ].includes(mode)
      expect(existsSync(sentinel)).toBe(!before)
      expect(existsSync(disposed)).toBe(!before)
      expect(events.filter((event) => event.type === 'case-end')).toHaveLength(
        before ? 0 : 1
      )
      if (mode === 'cleanup-error')
        expect(JSON.stringify(events)).toContain(
          'controlled production registry cleanup failure'
        )
      else if (mode !== 'normal')
        expect(events.some((event) => event.type === 'diagnostic')).toBe(true)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})

it('defers client Browser Mode snapshot publication to the owning watch parent', async () => {
  const client = await import('next/dist/experimental/testing/client/execute')
  const execution = await import(
    'next/dist/experimental/testing/execution/execute'
  )
  const updates: any[] = [
    { path: '/project/example.snap', content: 'new', previousContent: 'old' },
  ]
  const defer = jest.fn(async () => {})
  const spy = jest
    .spyOn(client, 'executeClient')
    .mockImplementation(async (artifact, options) => {
      expect(options.onSnapshotUpdates).toBe(defer)
      await options.onSnapshotUpdates!('/project/example.ts', updates)
      return { entryId: artifact.entryId, status: 'passed', durationMs: 1 }
    })
  try {
    const result = await execution.executeWithEnvironment(
      { kind: 'browser' } as any,
      { signal: new AbortController().signal, updateSnapshots: true } as any,
      { ...process.env },
      defer
    )
    expect(result.status).toBe('passed')
    expect(defer).toHaveBeenCalledWith('/project/example.ts', updates)
  } finally {
    spy.mockRestore()
  }
})

describe('client Browser console output forwarding', () => {
  async function observe(
    mode: 'normal' | 'navigation-error' | 'sink-error',
    fakeTimers?: import('next/dist/experimental/testing/assertions/utilities').FakeTimerOptions
  ) {
    const { EventEmitter } = require('node:events')
    const page = new EventEmitter()
    const trace: string[] = []
    const events: ResultEvent[] = []
    const failures: unknown[] = []
    const modules = [
      'next/dist/experimental/testing/browser/host',
      'next/dist/experimental/testing/client/server',
      'next/dist/experimental/testing/client/results',
      'next/dist/experimental/testing/client/engine-brand',
    ]
    const emit = (type: string, text: string) =>
      page.emit('console', { type: () => type, text: () => text })
    page.goto = jest.fn(async () => {
      for (const type of [
        'log',
        'info',
        'debug',
        'warning',
        'error',
        'trace',
        'assert',
      ])
        emit(type, `actual ${type}`)
      if (mode === 'navigation-error') throw new Error('navigation failed')
    })
    const context = {
      newPage: jest.fn(async () => page),
      close: jest.fn(async () => {
        trace.push('context-close')
        emit('log', 'queued user output')
        page.emit('close')
      }),
    }
    const browser = {
      newContext: jest.fn(async () => context),
      close: jest.fn(async () => {
        trace.push('browser-close')
      }),
    }
    const host = {
      wsEndpoint: 'ws://unit-browser',
      dispose: jest.fn(async () => {
        trace.push('host-close')
      }),
    }
    const server = {
      url: 'http://unit-browser/',
      completion: Promise.resolve({}),
      verify: jest.fn(async () => {}),
      assertClean: jest.fn(),
      mapStack: jest.fn(() => []),
      fail: jest.fn(),
      dispose: jest.fn(async () => {
        trace.push('server-close')
      }),
    }
    const collector = {
      accept: jest.fn(),
      events: [],
      fail: jest.fn((error) => {
        failures.push(error)
      }),
      hasFailure: () => failures.length !== 0,
      result: () => ({
        status: failures.length ? 'failed' : 'passed',
        updates: [],
      }),
    }
    const engineBrand = {
      start: jest.fn(async () => {}),
      fact: jest.fn(() => ({})),
      close: jest.fn(() => {
        trace.push('engine-close')
      }),
      afterOwnersClosed: jest.fn(async () => {
        trace.push('engine-after-close')
      }),
    }
    const profile = {
      id: 'unit-browser-profile',
      environment: 'browser',
      mode: 'development',
      runtime: 'nodejs',
      bundler: 'turbopack',
      browserClient: true,
    }
    const entry = {
      id: 'unit-browser-entry',
      file: '/project/contract.case.mjs',
      profile,
    }
    const artifact = {
      version: 2,
      kind: 'browser',
      entryId: entry.id,
      revision: 'unit-browser-revision',
      profile,
      client: {
        sourceFile: entry.file,
        asyncScope: 'promise-continuations-v1',
        creatorScope: 'synchronous-source-v1',
        creatorPromiseRoute: 'native-engine-v1',
      },
    }
    let configuration: any
    let result: unknown
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock(modules[0], () => ({
          createBrowserHost: async () => host,
          connectBrowserHost: async () => browser,
        }))
        jest.doMock(modules[1], () => ({
          createClientServer: async (options: any) => {
            configuration = options.configuration
            return server
          },
        }))
        jest.doMock(modules[2], () => ({
          createClientResultCollector: () => collector,
        }))
        jest.doMock(modules[3], () => ({
          createClientEngineBrand: () => engineBrand,
        }))
        const { executeClient } = jest.requireActual(
          'next/dist/experimental/testing/client/execute'
        ) as typeof import('next/dist/experimental/testing/client/execute')
        result = await executeClient(
          artifact as any,
          {
            entry,
            runId: 'unit-browser-run',
            fakeTimers,
            projectDir: '/project',
            setupFiles: [],
            signal: new AbortController().signal,
            updateSnapshots: false,
            testTimeout: 1000,
            hookTimeout: 1000,
            fileTimeout: 5000,
            onEvent(event: ResultEvent) {
              if (event.type === 'output') {
                trace.push(`output:${event.text.trim()}`)
                if (mode === 'sink-error')
                  throw new Error('console sink failed')
              }
              events.push(event)
            },
          } as any
        )
      })
      emit('log', 'after completed output')
      return { page, trace, events, failures, result, server, configuration }
    } finally {
      for (const name of modules) jest.dontMock(name)
    }
  }

  it('forwards real console text as scoped stdout/stderr before independently closing resources', async () => {
    const observed = await observe('normal')
    expect(observed.result).toMatchObject({ status: 'passed' })
    expect(observed.events.filter((event) => event.type === 'output')).toEqual(
      [
        'log',
        'info',
        'debug',
        'warning',
        'error',
        'trace',
        'assert',
        'queued user output',
      ].map((type) => ({
        version: 1,
        runId: 'unit-browser-run',
        timestamp: expect.any(Number),
        type: 'output',
        entryId: 'unit-browser-entry',
        revision: 'unit-browser-revision',
        stream: ['warning', 'error', 'trace', 'assert'].includes(type)
          ? 'stderr'
          : 'stdout',
        text:
          type === 'queued user output'
            ? 'queued user output\n'
            : `actual ${type}\n`,
      }))
    )
    expect(observed.trace).toEqual([
      ...['log', 'info', 'debug', 'warning', 'error', 'trace', 'assert'].map(
        (type) => `output:actual ${type}`
      ),
      'engine-close',
      'context-close',
      'output:queued user output',
      'browser-close',
      'host-close',
      'engine-after-close',
      'server-close',
    ])
    expect(observed.page.listenerCount('console')).toBe(0)
    expect(observed.failures).toEqual([])
  })

  it('retains output preceding a navigation failure and removes the console listener on failure', async () => {
    const observed = await observe('navigation-error')
    expect(observed.result).toMatchObject({ status: 'failed' })
    expect(
      observed.events.filter((event) => event.type === 'output')
    ).toHaveLength(8)
    expect(observed.failures).toEqual([
      expect.objectContaining({ message: 'navigation failed' }),
    ])
    expect(observed.trace.slice(-7)).toEqual([
      'engine-close',
      'context-close',
      'output:queued user output',
      'browser-close',
      'host-close',
      'engine-after-close',
      'server-close',
    ])
    expect(observed.page.listenerCount('console')).toBe(0)
  })

  it('reports a console observer failure without skipping remaining cleanup', async () => {
    const observed = await observe('sink-error')
    expect(observed.result).toMatchObject({ status: 'failed' })
    expect(observed.server.fail).toHaveBeenCalledTimes(8)
    expect(observed.failures).toHaveLength(8)
    for (const error of observed.failures)
      expect(error).toMatchObject({ message: 'console sink failed' })
    expect(observed.trace.slice(-7)).toEqual([
      'engine-close',
      'context-close',
      'output:queued user output',
      'browser-close',
      'host-close',
      'engine-after-close',
      'server-close',
    ])
    expect(observed.page.listenerCount('console')).toBe(0)
  })
  it('forwards project fake-timer configuration before navigating the Browser page', async () => {
    const fakeTimers = {
      now: 1234,
      toFake: ['Date', 'setTimeout', 'clearTimeout'] as const,
      loopLimit: 3,
      shouldClearNativeTimers: true,
    }
    const observed = await observe('normal', {
      ...fakeTimers,
      toFake: [...fakeTimers.toFake],
    })
    expect(observed.result).toMatchObject({ status: 'passed' })
    expect(observed.configuration.fakeTimers).toEqual(fakeTimers)
    expect(observed.failures).toEqual([])
    expect(observed.trace.slice(-7)).toEqual([
      'engine-close',
      'context-close',
      'output:queued user output',
      'browser-close',
      'host-close',
      'engine-after-close',
      'server-close',
    ])
    expect(observed.page.listenerCount('console')).toBe(0)
  })
})

describe('formatted Browser console transport', () => {
  it.each(['format', 'runtime', 'send-error'] as const)(
    'preserves genuine formatting and independent restoration for %s',
    (mode) => {
      const { spawnSync } = require('node:child_process')
      const result = spawnSync(
        process.execPath,
        [
          path.join(__dirname, 'client-console.cjs'),
          mode,
          require.resolve('next/dist/experimental/testing/client/console'),
          require.resolve('next/dist/experimental/testing/client/runtime'),
        ],
        { encoding: 'utf8', timeout: 20_000 }
      )
      const capture = process.env.NEXT_TESTING_CONSOLE_UNIT_EVIDENCE
      if (capture) {
        mkdirSync(capture, { recursive: true })
        writeFileSync(path.join(capture, `${mode}.stdout`), result.stdout ?? '')
        writeFileSync(path.join(capture, `${mode}.stderr`), result.stderr ?? '')
        writeFileSync(
          path.join(capture, `${mode}.json`),
          JSON.stringify({
            pid: result.pid,
            status: result.status,
            signal: result.signal,
            error: result.error?.message,
          })
        )
      }
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(0)
      const observed = JSON.parse(result.stdout)
      if (mode === 'format') {
        expect(observed.output.slice(0, 7)).toEqual(
          require('./console-format-pristine.json')
        )
        expect(observed.observerFailureRestored).toBe(true)
        expect(observed.stopFailureRestored).toBe(true)
      } else {
        expect(observed.restored).toBe(true)
        expect(observed.maximumConcurrent).toBe(1)
      }
    }
  )
})

describe('Browser console same-stream boundaries', () => {
  it.each([false, true])(
    'keeps fallback and RPC output with observer failure=%s',
    async (observerFailure) => {
      const { EventEmitter } = require('node:events')
      const page = new EventEmitter()
      const events: ResultEvent[] = [],
        errors: unknown[] = [],
        trace: string[] = []
      const modules = [
        'browser/host',
        'client/server',
        'client/results',
        'client/engine-brand',
      ].map((name) => `next/dist/experimental/testing/${name}`)
      const boundary =
        require('next/dist/experimental/testing/client/protocol').clientConsoleBoundary
      let onMessage: (value: unknown) => void = () => {}
      const emit = (type: string, text: string) =>
        page.emit('console', { type: () => type, text: () => text })
      page.goto = async () => {
        emit('log', 'prestart')
        // An ordinary log equal to a reserved debug boundary is still user data.
        emit('log', boundary.start)
        emit('debug', boundary.start)
        for (const kind of ['log', 'info', 'debug', 'warning', 'error'])
          emit(kind, `managed ${kind}`)
        for (const kind of ['trace', 'assert', 'table'])
          emit(kind, `fallback ${kind}`)
        for (const value of Object.values(boundary) as string[]) {
          emit('debug', boundary.escape)
          emit('debug', value)
          onMessage({ type: 'output', stream: 'stdout', text: `${value}\n` })
        }
        try {
          onMessage({
            type: 'output',
            stream: 'stderr',
            text: 'formatted RPC\n',
          })
        } finally {
          emit('debug', boundary.stop)
          emit('log', 'poststop')
          // Restored methods and inactive retained wrappers use normal fallback.
          for (const value of Object.values(boundary) as string[])
            emit('debug', value)
          emit('log', 'after retained marker')
        }
      }
      const context = {
        newPage: async () => page,
        close: async () => {
          trace.push('context')
          emit('log', 'queued teardown')
          page.emit('close')
        },
      }
      const browser = {
        newContext: async () => context,
        close: async () => {
          trace.push('browser')
        },
      }
      const host = {
        wsEndpoint: 'ws://unit',
        dispose: async () => {
          trace.push('host')
        },
      }
      const server = {
        url: 'http://unit/',
        completion: Promise.resolve({}),
        verify: async () => {},
        assertClean() {},
        mapStack: () => [],
        fail: jest.fn(),
        dispose: async () => {
          trace.push('server')
        },
      }
      const collector = {
        accept: jest.fn(),
        events: [],
        fail: (error: unknown) => errors.push(error),
        hasFailure: () => errors.length > 0,
        result: () => ({
          status: errors.length ? 'failed' : 'passed',
          updates: [],
        }),
      }
      const engineBrand = {
        start: async () => {},
        fact: () => ({}),
        close() {},
        afterOwnersClosed: async () => {},
      }
      const profile = {
        id: 'console-profile',
        environment: 'browser',
        mode: 'development',
        runtime: 'nodejs',
        bundler: 'turbopack',
        browserClient: true,
      }
      const entry = {
        id: 'console-entry',
        file: '/project/contract.mjs',
        profile,
      }
      const artifact = {
        version: 2,
        kind: 'browser',
        entryId: entry.id,
        revision: 'console-revision',
        profile,
        client: {
          sourceFile: entry.file,
          asyncScope: 'promise-continuations-v1',
          creatorScope: 'synchronous-source-v1',
          creatorPromiseRoute: 'native-engine-v1',
        },
      }
      try {
        await jest.isolateModulesAsync(async () => {
          jest.doMock(modules[0], () => ({
            createBrowserHost: async () => host,
            connectBrowserHost: async () => browser,
          }))
          jest.doMock(modules[1], () => ({
            createClientServer: async (options: any) => {
              onMessage = options.onMessage
              return server
            },
          }))
          jest.doMock(modules[2], () => ({
            createClientResultCollector: () => collector,
          }))
          jest.doMock(modules[3], () => ({
            createClientEngineBrand: () => engineBrand,
          }))
          const { executeClient } = jest.requireActual(
            'next/dist/experimental/testing/client/execute'
          )
          const result = await executeClient(artifact, {
            entry,
            runId: 'console-run',
            projectDir: '/project',
            setupFiles: [],
            signal: new AbortController().signal,
            updateSnapshots: false,
            testTimeout: 1000,
            hookTimeout: 1000,
            fileTimeout: 5000,
            onEvent(event: ResultEvent) {
              if (
                observerFailure &&
                event.type === 'output' &&
                event.text === 'formatted RPC\n'
              )
                throw new Error('formatted output sink failed')
              events.push(event)
            },
          })
          expect(result.status).toBe(observerFailure ? 'failed' : 'passed')
        })
        const output = events.filter(
          (event): event is Extract<ResultEvent, { type: 'output' }> =>
            event.type === 'output'
        )
        expect(output.map((event) => [event.stream, event.text])).toEqual([
          ['stdout', 'prestart\n'],
          ['stdout', `${boundary.start}\n`],
          ['stderr', 'fallback trace\n'],
          ['stderr', 'fallback assert\n'],
          ['stdout', 'fallback table\n'],
          ...Object.values(boundary).map((value) => ['stdout', `${value}\n`]),
          ...(observerFailure ? [] : [['stderr', 'formatted RPC\n']]),
          ['stdout', 'poststop\n'],
          ...Object.values(boundary).map((value) => ['stdout', `${value}\n`]),
          ['stdout', 'after retained marker\n'],
          ['stdout', 'queued teardown\n'],
        ])
        for (const event of output)
          expect(event).toMatchObject({
            version: 1,
            runId: 'console-run',
            entryId: entry.id,
            revision: artifact.revision,
            timestamp: expect.any(Number),
          })
        expect(collector.accept).not.toHaveBeenCalled()
        expect(trace).toEqual(['context', 'browser', 'host', 'server'])
        expect(page.listenerCount('console')).toBe(0)
        emit('log', 'after cleanup')
        expect(output).toHaveLength(observerFailure ? 14 : 15)
        expect(errors).toEqual(
          observerFailure
            ? [
                expect.objectContaining({
                  message: 'formatted output sink failed',
                }),
              ]
            : []
        )
      } finally {
        for (const name of modules) jest.dontMock(name)
      }
    }
  )
})

it('classifies a structured artifact as an execution fact during collection', async () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'next-collection-artifact-'))
  try {
    copyFileSync(
      path.join(__dirname, 'collection-entry.cjs'),
      path.join(rootDir, 'entry.cjs')
    )
    writeFileSync(
      path.join(rootDir, 'runtime-paths.json'),
      JSON.stringify({
        runner: require.resolve('next/dist/experimental/testing/runner'),
        vitest: require.resolve('next/dist/experimental/testing/vitest'),
        mode: 'execution-fact-test-artifact',
        marker: path.join(rootDir, 'cleanup.txt'),
      })
    )
    const profile = {
      id: 'unit',
      mode: 'development' as const,
      environment: 'node' as const,
      runtime: 'nodejs' as const,
      bundler: 'turbopack' as const,
    }
    const entry = {
      id: 'unit:list',
      file: path.join(rootDir, 'spec.ts'),
      profile,
    }
    const events: ResultEvent[] = []
    await expect(
      execute(
        {
          version: 2,
          kind: 'node',
          entryId: entry.id,
          profile,
          revision: 'collection',
          rootDir,
          entryPath: 'entry.cjs',
          files: ['entry.cjs', 'runtime-paths.json'],
          diagnostics: [],
        },
        {
          runId: 'collection',
          projectDir: rootDir,
          entry,
          setupFiles: [],
          collectOnly: true,
          snapshotUpdateMode: 'none',
          testTimeout: 1000,
          hookTimeout: 1000,
          fileTimeout: 5000,
          signal: new AbortController().signal,
          onEvent: (event) => events.push(event),
        }
      )
    ).rejects.toThrow('Collection worker returned execution facts')
    expect(events.some((event) => event.type === 'test-artifact')).toBe(false)
  } finally {
    rmSync(rootDir, { recursive: true, force: true })
  }
})

describe('Browser progress reporting', () => {
  it.each(['ordered', 'transport-error', 'serialization-error'] as const)(
    'queues progress without blocking execution and preserves cleanup for %s',
    (mode) => {
      const { spawnSync } = require('node:child_process')
      const result = spawnSync(
        process.execPath,
        [
          path.join(__dirname, 'client-progress.cjs'),
          mode,
          require.resolve('next/dist/experimental/testing/client/runtime'),
        ],
        { encoding: 'utf8', timeout: 20_000 }
      )
      const capture = process.env.NEXT_TESTING_BROWSER_PROGRESS_EVIDENCE
      if (capture) {
        mkdirSync(capture, { recursive: true })
        writeFileSync(path.join(capture, `${mode}.stdout`), result.stdout ?? '')
        writeFileSync(path.join(capture, `${mode}.stderr`), result.stderr ?? '')
        writeFileSync(
          path.join(capture, `${mode}.json`),
          JSON.stringify({
            pid: result.pid,
            status: result.status,
            signal: result.signal,
            error: result.error?.message,
          })
        )
      }
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(0)
      const observed = JSON.parse(result.stdout)
      expect(observed.restored).toBe(true)
      expect(observed.maximumConcurrent).toBe(1)
      expect(
        observed.callbacks.every(
          (row: { synchronous: boolean }) => row.synchronous
        )
      ).toBe(true)
    }
  )
})

it('projects Browser provided values once and initializes named injection before collection', () => {
  const { spawnSync } = require('node:child_process')
  const result = spawnSync(
    process.execPath,
    [
      path.join(__dirname, 'browser-provided-context.cjs'),
      require.resolve('next/dist/experimental/testing/client/execute'),
      require.resolve('next/dist/experimental/testing/client/runtime'),
      require.resolve('next/dist/experimental/testing/vitest'),
      require.resolve('next/dist/experimental/testing/client/vitest'),
    ],
    { encoding: 'utf8', timeout: 20_000 }
  )
  const capture = process.env.NEXT_TESTING_BROWSER_INJECT_EVIDENCE
  if (capture) {
    mkdirSync(capture, { recursive: true })
    writeFileSync(
      path.join(capture, 'provided-context.stdout'),
      result.stdout ?? ''
    )
    writeFileSync(
      path.join(capture, 'provided-context.stderr'),
      result.stderr ?? ''
    )
    writeFileSync(
      path.join(capture, 'provided-context.json'),
      JSON.stringify({
        pid: result.pid,
        status: result.status,
        signal: result.signal,
        error: result.error?.message,
      })
    )
  }
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  expect(result.status).toBe(0)
  const observed = JSON.parse(result.stdout.trim().split('\n').at(-1)!)
  expect(observed.rows).toEqual(
    require('./browser-provided-context-pristine.json').rows
  )
})

it('forwards Browser reset settings including false and preserves genuine file resets', async () => {
  const fields = [
    'clearMocks',
    'mockReset',
    'restoreMocks',
    'unstubGlobals',
  ] as const
  const scenarios =
    require('../next-testing-lifecycle/browser-mock-reset-config-pristine.json').scenarios
  const profile = {
    id: 'reset-profile',
    environment: 'browser',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
    browserClient: true,
  }
  const entry = { id: 'reset-entry', file: '/project/reset.test.mjs', profile }
  const artifact = {
    version: 2,
    kind: 'browser',
    entryId: entry.id,
    revision: 'reset-revision',
    profile,
    client: {
      sourceFile: entry.file,
      asyncScope: 'promise-continuations-v1',
      creatorScope: 'synchronous-source-v1',
      creatorPromiseRoute: 'native-engine-v1',
    },
  }
  const modules = [
    'next/dist/experimental/testing/client/server',
    'next/dist/experimental/testing/client/results',
  ]
  const { spawnSync } =
    require('node:child_process') as typeof import('node:child_process')
  const capture = process.env.NEXT_TESTING_RESET_CONFIG_EVIDENCE
  const run = (name: string, args: string[]) => {
    const child = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      timeout: 20_000,
    })
    if (capture) {
      mkdirSync(capture, { recursive: true })
      writeFileSync(path.join(capture, `${name}.stdout`), child.stdout ?? '')
      writeFileSync(path.join(capture, `${name}.stderr`), child.stderr ?? '')
      writeFileSync(
        path.join(capture, `${name}.json`),
        JSON.stringify({
          pid: child.pid,
          status: child.status,
          signal: child.signal,
          error: child.error?.message,
        })
      )
    }
    expect(child.error).toBeUndefined()
    expect(child.signal).toBeNull()
    expect({
      status: child.status,
      stdout: child.stdout,
      stderr: child.stderr,
    }).toMatchObject({ status: 0 })
  }
  for (const [name, raw] of Object.entries(scenarios)) {
    const flags = (raw as any).flags
    let configuration: any
    const stop = new Error(
      'Stop after observing the actual Browser configuration'
    )
    const failures: unknown[] = []
    try {
      await jest.isolateModulesAsync(async () => {
        jest.doMock(modules[0], () => ({
          createClientServer: async (options: any) => {
            configuration = options.configuration
            throw stop
          },
        }))
        jest.doMock(modules[1], () => ({
          createClientResultCollector: () => ({
            events: [],
            fail: (error: unknown) => failures.push(error),
            hasFailure: () => failures.length > 0,
            result: () => ({ status: 'failed', updates: [] }),
          }),
        }))
        const { executeClient } = jest.requireActual(
          'next/dist/experimental/testing/client/execute'
        )
        const result = await executeClient(artifact, {
          entry,
          runId: 'reset-run',
          projectDir: '/project',
          setupFiles: [],
          signal: new AbortController().signal,
          updateSnapshots: false,
          testTimeout: 1000,
          hookTimeout: 1000,
          fileTimeout: 5000,
          onEvent() {},
          ...flags,
        })
        expect(result.status).toBe('failed')
        expect(failures).toContain(stop)
        for (const field of fields)
          expect(configuration[field]).toBe(flags[field])
      })
    } finally {
      for (const name of modules) jest.dontMock(name)
    }
    run(name, [
      '--test-reporter=tap',
      path.join(
        __dirname,
        '../next-testing-lifecycle/browser-fake-timers-integration.cjs'
      ),
      `browser-reset-config-${name}`,
    ])
  }
  run('bootstrap', [
    path.join(__dirname, 'client-console.cjs'),
    'runtime',
    require.resolve('next/dist/experimental/testing/client/console'),
    require.resolve('next/dist/experimental/testing/client/runtime'),
  ])
}, 30000)

it.each(['node', 'browser'] as const)(
  'preserves the %s globals facade, forwarding and descriptor lifetime',
  (mode) => {
    const { spawnSync } = require('node:child_process')
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        require.resolve('tsx'),
        path.join(__dirname, 'browser-globals.cjs'),
        mode,
        require.resolve('next/dist/experimental/testing/runner'),
        require.resolve('next/dist/experimental/testing/vitest'),
        require.resolve(
          'next/dist/experimental/testing/client/invocation-platform'
        ),
        require.resolve('next/dist/experimental/testing/client/vitest'),
        require.resolve('next/dist/experimental/testing/client/execute'),
        require.resolve('next/dist/experimental/testing/client/runtime'),
      ],
      { encoding: 'utf8', timeout: 20_000 }
    )
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    const observed = JSON.parse(result.stdout.trim().split('\n').at(-1)!)
    expect(observed.mode).toBe(mode)
    expect(observed.globals).toBe(19)
    if (mode === 'node') expect(observed.restored).toBe(true)
    else expect(observed.browserFacade).toBe(true)
  }
)

it.each(['contract', 'mutation', 'error-shape', 'transport-error'])(
  'preserves Browser data artifact %s transport and task semantics',
  (mode) => {
    const { spawnSync } = require('node:child_process')
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, 'browser-artifacts.cjs'),
        mode,
        ...[
          'client/runtime',
          'client/server',
          'client/results',
          'vitest',
          'client/vitest',
        ].map((name) =>
          require.resolve('next/dist/experimental/testing/' + name)
        ),
      ],
      { encoding: 'utf8', timeout: 20_000 }
    )
    const capture = process.env.NEXT_TESTING_BROWSER_ARTIFACT_EVIDENCE
    if (capture) {
      mkdirSync(capture, { recursive: true })
      writeFileSync(path.join(capture, mode + '.stdout'), result.stdout ?? '')
      writeFileSync(path.join(capture, mode + '.stderr'), result.stderr ?? '')
      writeFileSync(
        path.join(capture, mode + '.json'),
        JSON.stringify({
          pid: result.pid,
          status: result.status,
          signal: result.signal,
          error: result.error?.message,
        })
      )
    }
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toMatchObject({ status: 0 })
    const observed = JSON.parse(result.stdout.trim().split('\n').at(-1)!)
    expect(observed.mode).toBe(mode)
    expect(observed.cleaned).toBe(true)
  }
)

it('orders post-stop native Browser output after queued RPC output through cleanup failures', () => {
  const { spawnSync } = require('node:child_process')
  const result = spawnSync(
    process.execPath,
    [
      path.join(__dirname, 'client-console.cjs'),
      'parent-order',
      require.resolve('next/dist/experimental/testing/client/console'),
      require.resolve('next/dist/experimental/testing/client/runtime'),
    ],
    { encoding: 'utf8', timeout: 20_000 }
  )
  const capture = process.env.NEXT_TESTING_CONSOLE_UNIT_EVIDENCE
  if (capture) {
    mkdirSync(capture, { recursive: true })
    writeFileSync(
      path.join(capture, 'parent-order.stdout'),
      result.stdout ?? ''
    )
    writeFileSync(
      path.join(capture, 'parent-order.stderr'),
      result.stderr ?? ''
    )
    writeFileSync(
      path.join(capture, 'parent-order.json'),
      JSON.stringify({
        pid: result.pid,
        status: result.status,
        signal: result.signal,
        error: result.error?.message,
      })
    )
  }
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  expect({
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toMatchObject({ status: 0 })
  const observed = JSON.parse(result.stdout.trim())
  expect(observed.mode).toBe('parent-order')
  expect(observed.scenarios).toHaveLength(3)
})

it('settles Browser imports through the actual facade and disposes the tracker through runtime failures', () => {
  const { spawnSync } = require('node:child_process')
  for (const mode of ['normal', 'initialize-error', 'file-dispose-error']) {
    const result = spawnSync(
      process.execPath,
      [
        path.join(__dirname, 'browser-import-settled.cjs'),
        mode,
        require.resolve('next/dist/experimental/testing/client/runtime'),
        require.resolve('next/dist/experimental/testing/client/vitest'),
      ],
      { encoding: 'utf8', timeout: 20_000 }
    )
    const capture = process.env.NEXT_TESTING_IMPORT_SETTLED_EVIDENCE
    if (capture) {
      mkdirSync(capture, { recursive: true })
      writeFileSync(path.join(capture, mode + '.stdout'), result.stdout ?? '')
      writeFileSync(path.join(capture, mode + '.stderr'), result.stderr ?? '')
      writeFileSync(
        path.join(capture, mode + '.json'),
        JSON.stringify({
          pid: result.pid,
          status: result.status,
          signal: result.signal,
          error: result.error?.message,
        })
      )
    }
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toMatchObject({ status: 0 })
    const observed = JSON.parse(result.stdout.trim())
    expect(observed.mode).toBe(mode)
    expect(observed.trackerRestored).toBe(true)
    expect(observed.completeStatus).toBe(
      mode === 'normal' ? 'passed' : 'failed'
    )
  }
})

it('transports Browser env settings and configures the actual runtime before authored load', async () => {
  const modules = [
    'next/dist/experimental/testing/client/server',
    'next/dist/experimental/testing/client/results',
  ]
  const profile = {
    id: 'env-browser',
    environment: 'browser',
    mode: 'development',
    runtime: 'nodejs',
    bundler: 'turbopack',
    browserClient: true,
  }
  const entry = { id: 'env-entry', file: '/project/env.test.mjs', profile }
  const artifact = {
    version: 2,
    kind: 'browser',
    entryId: entry.id,
    revision: 'env-revision',
    profile,
    client: {
      sourceFile: entry.file,
      asyncScope: 'promise-continuations-v1',
      creatorScope: 'synchronous-source-v1',
      creatorPromiseRoute: 'native-engine-v1',
    },
  }
  const env = { NEXT_ENV_BOOTSTRAP: 'configured-before-load' }
  let configuration: any
  const stopped = new Error('Observe config before acquiring a Browser host')
  const failures: unknown[] = []
  try {
    await jest.isolateModulesAsync(async () => {
      jest.doMock(modules[0], () => ({
        createClientServer: async (options: any) => {
          configuration = options.configuration
          throw stopped
        },
      }))
      jest.doMock(modules[1], () => ({
        createClientResultCollector: () => ({
          events: [],
          fail: (error: unknown) => failures.push(error),
          hasFailure: () => failures.length > 0,
          result: () => ({ status: 'failed', updates: [] }),
        }),
      }))
      const { executeClient } = jest.requireActual(
        'next/dist/experimental/testing/client/execute'
      )
      const result = await executeClient(artifact, {
        entry,
        runId: 'env-run',
        projectDir: '/project',
        setupFiles: [],
        signal: new AbortController().signal,
        updateSnapshots: false,
        testTimeout: 1000,
        hookTimeout: 1000,
        fileTimeout: 5000,
        onEvent() {},
        env,
        unstubEnvs: true,
      })
      expect(result.status).toBe('failed')
      expect(failures).toContain(stopped)
      expect(configuration.env).toBe(env)
      expect(configuration.unstubEnvs).toBe(true)
    })
  } finally {
    for (const name of modules) jest.dontMock(name)
  }
  const { spawnSync } =
    require('node:child_process') as typeof import('node:child_process')
  for (const mode of ['env', 'env-cold-config', 'env-cold-boolean']) {
    const child = spawnSync(
      process.execPath,
      [
        path.join(__dirname, 'client-console.cjs'),
        mode,
        require.resolve('next/dist/experimental/testing/client/console'),
        require.resolve('next/dist/experimental/testing/client/runtime'),
      ],
      { encoding: 'utf8', timeout: 20_000 }
    )
    const capture = process.env.NEXT_TESTING_BROWSER_ENV_EVIDENCE
    if (capture) {
      mkdirSync(capture, { recursive: true })
      writeFileSync(path.join(capture, mode + '.stdout'), child.stdout ?? '')
      writeFileSync(path.join(capture, mode + '.stderr'), child.stderr ?? '')
      writeFileSync(
        path.join(capture, mode + '.json'),
        JSON.stringify({
          pid: child.pid,
          status: child.status,
          signal: child.signal,
          error: child.error?.message,
        })
      )
    }
    expect(child.error).toBeUndefined()
    expect(child.signal).toBeNull()
    expect(child.status).toBe(0)
    expect(child.stderr).toBe('')
    expect(JSON.parse(child.stdout.trim().split('\n').at(-1)!)).toMatchObject({
      mode,
      restored: true,
      maximumConcurrent: 1,
      envFactoryCalls: 1,
      envOrder: ['factory', 'initialize', 'load', 'body'],
    })
  }
})
