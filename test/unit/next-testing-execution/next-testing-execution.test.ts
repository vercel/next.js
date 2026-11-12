import path from 'path'
import { execFileSync } from 'child_process'
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
  symlinkSync,
  existsSync,
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
import {
  parseTestInspectAddress,
  parseTestInspectBrkAddress,
} from 'next/dist/experimental/testing/execution/inspector'
import WebSocket from 'next/dist/compiled/ws'
import { assertArtifactProfile } from 'next/dist/experimental/testing/execution/artifact-profile'
import { createLateFailureSink } from 'next/dist/experimental/testing/execution/late-failures'
import { browserOutputDirectory } from 'next/dist/experimental/testing/execution/browser-output'
import { assertCompiledSetup } from 'next/dist/experimental/testing/execution/setup'

const worker = path.join(__dirname, 'worker.cjs')
const options: TestProcessOptions = {
  cwd: __dirname,
  env: { ...process.env, NODE_ENV: 'development' },
  input: 'normal',
  timeoutMs: 5000,
  shutdownGraceMs: 100,
  onMessage() {},
}

describe('explicit file worker inspector', () => {
  it.each([
    [undefined, undefined],
    [false, undefined],
    ['false', undefined],
    ['no', undefined],
    [true, '127.0.0.1:9229'],
    ['true', '127.0.0.1:9229'],
    ['yes', '127.0.0.1:9229'],
    ['0', '127.0.0.1:9229'],
    ['127.0.0.1:0', '127.0.0.1:9229'],
    ['127.0.0.1:9231', '127.0.0.1:9231'],
  ])('parses the pinned break address %s', (input, expected) => {
    expect(parseTestInspectBrkAddress(input)).toBe(expected)
  })

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

  it('pauses the real worker before entry evaluation and resumes through CDP', async () => {
    const controller = new AbortController()
    const messages: { inspector: string; pid: number }[] = []
    let advertise!: (value: string) => void
    const advertised = new Promise<string>((resolve) => {
      advertise = resolve
    })
    let stderr = ''
    const completion = runTestProcess(worker, {
      ...options,
      inspect: '127.0.0.1:0',
      inspectBrk: true,
      signal: controller.signal,
      timeoutMs: 10000,
      input: 'inspector',
      onMessage: (message) =>
        messages.push(message as (typeof messages)[number]),
      onOutput(stream, bytes) {
        if (stream !== 'stderr') return
        stderr += bytes.toString()
        const match = stderr.match(/ws:\/\/[^\s]+/)
        if (match) advertise(match[0])
      },
    })
    let socket: WebSocket | undefined
    try {
      const url = await Promise.race([
        advertised,
        completion.then(() => {
          throw new Error('The worker exited before advertising its inspector.')
        }),
      ])
      expect(messages).toEqual([])
      socket = new WebSocket(url)
      const opened = new Promise<void>((resolve, reject) => {
        socket!.addEventListener('open', () => resolve(), { once: true })
        socket!.addEventListener('error', reject, { once: true })
      })
      let sequence = 0
      const responses = new Map<
        number,
        { resolve: () => void; reject: (error: Error) => void }
      >()
      let paused!: () => void
      const pause = new Promise<void>((resolve) => {
        paused = resolve
      })
      socket.addEventListener('message', ({ data }) => {
        const message = JSON.parse(String(data))
        if (message.method === 'Debugger.paused') paused()
        const pending = responses.get(message.id)
        if (pending) {
          responses.delete(message.id)
          if (message.error)
            pending.reject(new Error(JSON.stringify(message.error)))
          else pending.resolve()
        }
      })
      const send = (method: string) =>
        new Promise<void>((resolve, reject) => {
          const id = ++sequence
          responses.set(id, { resolve, reject })
          socket!.send(JSON.stringify({ id, method }))
        })
      await opened
      await send('Debugger.enable')
      await send('Runtime.runIfWaitingForDebugger')
      await pause
      expect(messages).toEqual([])
      await send('Debugger.resume')
      const disconnected = new Promise<void>((resolve) =>
        socket!.addEventListener('close', () => resolve(), { once: true })
      )
      socket.close()
      await disconnected
      expect(await completion).toEqual({
        reason: 'exit',
        code: 0,
        signal: null,
      })
      expect(messages).toHaveLength(1)
      expect(messages[0].inspector).toBe(url)
      expect(() => process.kill(messages[0].pid, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      socket?.close()
      controller.abort()
      await completion
    }
  }, 15000)

  it('cancels a paused inspector without evaluating the worker entry', async () => {
    const controller = new AbortController()
    const messages: unknown[] = []
    const completion = runTestProcess(worker, {
      ...options,
      inspect: '127.0.0.1:0',
      inspectBrk: true,
      signal: controller.signal,
      input: 'inspector',
      onMessage: (message) => messages.push(message),
      onOutput(stream, bytes) {
        if (
          stream === 'stderr' &&
          bytes.toString().includes('Debugger listening')
        )
          controller.abort()
      },
    })
    expect((await completion).reason).toBe('cancelled')
    expect(messages).toEqual([])
  })
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

  it('allows only the parent to terminate a completed worker without aborting its lifetime', async () => {
    const controller = new AbortController()
    let terminate!: () => void
    const result = await runTestProcess(worker, {
      ...options,
      input: 'wait',
      signal: controller.signal,
      onReady(_send, stopAfterCompletion) {
        terminate = stopAfterCompletion
      },
      onMessage(value) {
        if ((value as { ready?: boolean }).ready) terminate()
      },
    })
    expect(result).toEqual({ code: null, signal: 'SIGTERM', reason: 'exit' })
    expect(controller.signal.aborted).toBe(false)
    // The callback can no longer act on a process/group identity after closure.
    expect(() => terminate()).toThrow('after interruption')
  })

  it('does not mistake a forced completion kill for expected SIGTERM', async () => {
    let terminate!: () => void
    const result = await runTestProcess(worker, {
      ...options,
      input: 'ignore-termination',
      onReady(_send, stopAfterCompletion) {
        terminate = stopAfterCompletion
      },
      onMessage(value) {
        if ((value as { ready?: boolean }).ready) terminate()
      },
    })
    expect(result).toEqual({ code: null, signal: 'SIGKILL', reason: 'exit' })
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

  it('binds proxy-hidden DOM provider methods while preserving configurable overrides and lazy getters', () => {
    const result = require('node:child_process').spawnSync(
      process.execPath,
      [path.join(__dirname, 'dom-window-provider.cjs')],
      { encoding: 'utf8', timeout: 20000 }
    )
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    if (result.status !== 0) throw new Error(result.stderr)
    expect(JSON.parse(result.stdout)).toEqual({
      proxyHiddenMethods: true,
      stableBoundIdentity: true,
      nativeEventIdentity: true,
      removal: true,
      configurablePlaceholder: true,
      authoredOverrideAndPropagation: true,
      lazyGetters: true,
      restored: true,
    })
  })

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

  it('ignores Edge VM options without evaluating code and restores globals', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'next-edge-options-'))
    try {
      expect(
        probe(
          root,
          `(async()=>{const {openTestEnvironment}=require(process.argv[1]);const owned=await openTestEnvironment(process.argv[2],{name:'edge-runtime',options:{initialCode:'globalThis.unqualifiedEdgeCode=true'}});const ignored=!('unqualifiedEdgeCode'in globalThis);await owned.dispose();console.log(JSON.stringify({ignored,removed:!('EdgeRuntime'in globalThis)&&!('unqualifiedEdgeCode'in globalThis)}))})().catch(error=>{console.error(error);process.exitCode=1})`
        )
      ).toEqual({ ignored: true, removed: true })
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

it('captures real Node console task origins and write groups with real clocks, drains IPC and restores console after failure', async () => {
  const {
    installTestConsole,
  } = require('next/dist/experimental/testing/execution/console')
  const {
    createAsyncScope,
    getConsoleTask,
  } = require('next/dist/experimental/testing/runner/async-context')
  const originalConsole = Object.getOwnPropertyDescriptor(
    globalThis,
    'console'
  )!
  const originalNow = Date.now
  const originalMicrotask = globalThis.queueMicrotask
  const records: any[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const late: unknown[] = []
  const scope = createAsyncScope(
    {
      kind: 'attempt',
      context: {
        id: 'case-A/0/0',
        testId: 'case-A',
        retry: 0,
        repeat: 0,
        name: 'A',
      },
    },
    (error: unknown) => late.push(error)
  )
  const hook = createAsyncScope(
    { kind: 'hook', context: { id: 'hook-B', suiteId: 'suite-B', name: 'B' } },
    (error: unknown) => late.push(error)
  )
  const before = originalNow()
  const capture = installTestConsole({
    fileId: 'file',
    getTask: getConsoleTask,
    publish(record: unknown) {
      records.push(record)
      return gate
    },
  })
  try {
    Date.now = () => 123
    globalThis.queueMicrotask = () => {
      throw new Error('Fake clock must not schedule console delivery')
    }
    scope.run(() => {
      console.log('first')
      console.log('second')
      console.error('third')
    })
    hook.run(() => console.warn('hook'))
    scope.close()
    await Promise.resolve()
    let disposed = false
    const disposal = capture.dispose().then(() => {
      disposed = true
    })
    await Promise.resolve()
    expect(disposed).toBe(false)
    expect(Object.getOwnPropertyDescriptor(globalThis, 'console')).toEqual(
      originalConsole
    )
    release()
    await disposal
    expect(records.map(({ timestamp, ...record }) => record)).toEqual([
      {
        stream: 'stdout',
        text: 'first\nsecond\n',
        console: { taskId: 'case-A', size: 2 },
        caseId: 'case-A',
        attempt: { id: 'case-A/0/0', retry: 0, repeat: 0 },
      },
      {
        stream: 'stderr',
        text: 'third\n',
        console: { taskId: 'case-A', size: 1 },
        caseId: 'case-A',
        attempt: { id: 'case-A/0/0', retry: 0, repeat: 0 },
      },
      {
        stream: 'stderr',
        text: 'hook\n',
        console: { taskId: 'suite-B', size: 1 },
      },
    ])
    for (const record of records)
      expect(record.timestamp).toBeGreaterThanOrEqual(before)
    expect(late).toEqual([])
  } finally {
    release()
    await capture.dispose()
    Date.now = originalNow
    globalThis.queueMicrotask = originalMicrotask
    hook.close()
  }
  const error = new Error('console IPC failed')
  const failed = installTestConsole({
    fileId: 'file',
    getTask: () => undefined,
    publish: async () => {
      throw error
    },
  })
  console.log('failure')
  await expect(failed.dispose()).rejects.toBe(error)
  expect(Object.getOwnPropertyDescriptor(globalThis, 'console')).toEqual(
    originalConsole
  )
})

it('flushes prior console delivery without uninstalling capture for environment teardown', async () => {
  const {
    installTestConsole,
  } = require('next/dist/experimental/testing/execution/console')
  const original = Object.getOwnPropertyDescriptor(globalThis, 'console')!
  const records: any[] = []
  let release!: () => void
  const delivered = new Promise<void>((resolve) => {
    release = resolve
  })
  const capture = installTestConsole({
    fileId: 'environment-file',
    getTask: () => undefined,
    publish(record: unknown) {
      records.push(record)
      return delivered
    },
  })
  try {
    console.log('afterAll')
    let flushed = false
    const flushing = capture.flush().then(() => {
      flushed = true
    })
    await Promise.resolve()
    expect(flushed).toBe(false)
    expect(
      Object.getOwnPropertyDescriptor(globalThis, 'console')!.value
    ).not.toBe(original.value)
    expect(records.map(({ text }) => text)).toEqual(['afterAll\n'])
    release()
    await flushing
    console.log('environment teardown')
    await capture.flush()
    expect(records.map(({ text }) => text)).toEqual([
      'afterAll\n',
      'environment teardown\n',
    ])
    expect(
      Object.getOwnPropertyDescriptor(globalThis, 'console')!.value
    ).not.toBe(original.value)
  } finally {
    release()
    await capture.dispose()
  }
  expect(Object.getOwnPropertyDescriptor(globalThis, 'console')).toEqual(
    original
  )
})

it('retains actual console delivery failures while restoring capture after a failed flush', async () => {
  const {
    installTestConsole,
  } = require('next/dist/experimental/testing/execution/console')
  const original = Object.getOwnPropertyDescriptor(globalThis, 'console')!
  const failure = new Error('actual console delivery failed')
  const capture = installTestConsole({
    fileId: 'environment-file',
    getTask: () => undefined,
    publish: () => Promise.reject(failure),
  })
  console.log('before teardown')
  try {
    await expect(capture.flush()).rejects.toBe(failure)
  } finally {
    await expect(capture.dispose()).rejects.toBe(failure)
  }
  expect(Object.getOwnPropertyDescriptor(globalThis, 'console')).toEqual(
    original
  )
})

it('removes console drain abort listeners and observes a real callback rejection after cancellation', async () => {
  const {
    drainConsoleCallbacks,
  } = require('next/dist/experimental/testing/execution/console-drain')
  const { getEventListeners } = require('node:events')
  const controller = new AbortController()
  const cancellation = new Error('actual pending console cancellation')
  const late = new Error('actual later console rejection')
  let rejectLater!: (error: Error) => void
  const callback = new Promise<void>((_resolve, reject) => {
    rejectLater = reject
  })
  const pending = drainConsoleCallbacks(() => callback, controller.signal)
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1)
  controller.abort(cancellation)
  await expect(pending).rejects.toBe(cancellation)
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  rejectLater(late)
  await new Promise<void>((resolve) => setImmediate(resolve))
  const skipped = jest.fn(async () => {})
  await expect(drainConsoleCallbacks(skipped, controller.signal)).rejects.toBe(
    cancellation
  )
  expect(skipped).not.toHaveBeenCalled()
})

// These pure contracts do not qualify native shared AppPage emission.
describe('shared RSC compiler and per-file rendering contracts', () => {
  it.each([
    'dispatch',
    'identity',
    'refusals',
    'route-bytes',
    'source-bytes',
    'file-bindings',
  ])('validates %s without evaluating an application entry', (mode) => {
    const stdout = execFileSync(
      process.execPath,
      [
        path.join(__dirname, 'rsc-cohort-contract.cjs'),
        path.join(__dirname, '../../..'),
        mode,
      ],
      { encoding: 'utf8', timeout: 15000 }
    )
    expect(JSON.parse(stdout)).toMatchObject({
      mode,
      dataContractOnly: true,
      nativeAppPageConformanceQualified: false,
    })
  })
})

describe('actual host console task preservation', () => {
  it.each(['actual', 'absent'])(
    'preserves %s task capability while capturing and restoring output',
    (mode) => {
      const stdout = execFileSync(
        process.execPath,
        [
          path.join(__dirname, 'console-create-task.cjs'),
          path.join(__dirname, '../../..'),
          mode,
        ],
        { encoding: 'utf8', timeout: 10000 }
      )
      expect(JSON.parse(stdout)).toMatchObject({
        mode,
        actualHostTaskPreserved: true,
        originalConsoleRestored: true,
        fakeTaskShim: false,
      })
    }
  )
})

describe('pinned Edge environment ignored options', () => {
  it.each(['default', 'initial', 'codeGeneration', 'unknown'])(
    'executes the real provider and restores globals for %s',
    (variant) => {
      const stdout = execFileSync(
        process.execPath,
        [
          path.join(__dirname, 'edge-options.cjs'),
          path.dirname(require.resolve('next/package.json')),
          variant,
        ],
        { encoding: 'utf8', timeout: 10000 }
      )
      expect(JSON.parse(stdout)).toEqual({
        variant,
        realProviderRow: true,
        optionsIgnoredAndUnmodified: true,
        hostGlobalsKept: true,
        providerGlobalsRestored: true,
        repeatedDispose: true,
      })
    }
  )

  it('retains the existing nonserializable environment-options refusal', () => {
    const stdout = execFileSync(
      process.execPath,
      [
        path.join(__dirname, 'edge-options.cjs'),
        path.dirname(require.resolve('next/package.json')),
        'nonserializable',
      ],
      { encoding: 'utf8', timeout: 10000 }
    )
    expect(JSON.parse(stdout)).toEqual({
      variant: 'nonserializable',
      parserRefusalPreserved: true,
      providerNotExposed: true,
    })
  })
})

it.each(['cold', 'authored-nonconfig'])(
  'retains the cold Edge constructor boundary and later mutation guard for %s',
  (variant) => {
    const stdout = execFileSync(
      process.execPath,
      [
        path.join(__dirname, 'edge-options.cjs'),
        path.dirname(require.resolve('next/package.json')),
        variant,
      ],
      { encoding: 'utf8', timeout: 10000 }
    )
    expect(JSON.parse(stdout)).toEqual({
      variant,
      coldRealProvider: true,
      providerGlobalsRestored: true,
      authoredNonconfigGuardHeld: variant === 'authored-nonconfig',
    })
  }
)

describe('ordinary Node worker raw error stacks', () => {
  it.each(['native', 'custom-data'])(
    'retains the original %s preparer and compiler source locations',
    (mode) => {
      const stdout = execFileSync(
        process.execPath,
        [
          '--enable-source-maps',
          path.join(__dirname, 'node-stack-trace.cjs'),
          path.dirname(require.resolve('next/package.json')),
          mode,
        ],
        { encoding: 'utf8', timeout: 10000 }
      )
      expect(JSON.parse(stdout)).toEqual({
        mode,
        sourceMapEnabledBeforeLoad: true,
        originalPrepareDescriptorRestored: true,
        sameActualError: true,
        errorDescriptorsPreserved: true,
        gettersMatchNativeControl: true,
        allFramesRetained: true,
        rawJsonUsesActualStack: true,
        nativeAddonsLoaded: 0,
      })
    }
  )
})

describe('native-authored Node stack consumers', () => {
  it.each([
    'locations',
    'snapshots',
    'diagnostics',
    'suite-own',
    'refusals',
    'registration',
  ])(
    'uses retained compiler sources for %s without remapping authored points',
    (mode) => {
      const stdout = execFileSync(
        process.execPath,
        [
          '--enable-source-maps',
          path.join(__dirname, 'node-stack-consumers.cjs'),
          path.dirname(require.resolve('next/package.json')),
          mode,
        ],
        { encoding: 'utf8', timeout: 10000 }
      )
      expect(JSON.parse(stdout)).toEqual({
        mode,
        actualRetainedCompilerSource: true,
        nativeAuthoredVariant: true,
        rawStackUnchanged: true,
        nativeAddonsLoaded: 0,
      })
    }
  )
})
