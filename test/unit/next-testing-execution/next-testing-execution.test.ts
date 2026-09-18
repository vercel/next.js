import path from 'path'
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  symlinkSync,
  existsSync,
  copyFileSync,
} from 'fs'
import { pathToFileURL } from 'url'
import { tmpdir } from 'os'
import { retry } from 'next-test-utils'
import {
  runTestProcess,
  type TestProcessOptions,
} from 'next/dist/experimental/testing/execution/process'
import { createArtifactSourceMapLookup } from 'next/dist/experimental/testing/execution/source-maps'
import { withFileCacheDirectory } from 'next/dist/experimental/testing/execution/file-cache'
import { assertArtifactProfile } from 'next/dist/experimental/testing/execution/artifact-profile'
import { createLateFailureSink } from 'next/dist/experimental/testing/execution/late-failures'
import { browserOutputDirectory } from 'next/dist/experimental/testing/execution/browser-output'
import { assertCompiledSetup } from 'next/dist/experimental/testing/execution/setup'
import type {
  WorkerInput,
  WorkerMessage,
} from 'next/dist/experimental/testing/execution/protocol'

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
  ])(
    'handles marker=$marked and runtime=$expose',
    async ({ marked, expose, status }) => {
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
            if (mode === 'reporter')
              throw new Error('descendant reporter failed')
          },
        })
        if (mode === 'reporter') {
          await expect(completion).rejects.toThrow('descendant reporter failed')
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
    const lookup = createArtifactSourceMapLookup({ rootDir, files: [files[0]] })
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
