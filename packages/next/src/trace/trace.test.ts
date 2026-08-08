import { mkdtemp, rm } from 'fs/promises'
import fs, { readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from '../shared/lib/constants'
import { createJsonReporter } from './report/to-json'
import type { TraceEvent } from './types'
import { setGlobal } from './shared'
import {
  clearTraceEvents,
  exportTraceState,
  flushAllTraces,
  getTraceEvents,
  initializeTraceState,
  recordTraceEvents,
  trace,
} from './trace'

function traceEvent(name: string): TraceEvent {
  return {
    name,
    duration: 1,
    timestamp: 1,
    id: 1,
    startTime: 1,
    tags: {},
  }
}

// Newline-delimited JSON: each line is an array of spans, as read by
// `test/lib/parse-trace-file.ts` and `trace-uploader.ts`.
function readSpans(file: string): TraceEvent[] {
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => JSON.parse(line) as TraceEvent[])
}

function readSpanNames(file: string): string[] {
  return readSpans(file).map((event) => event.name)
}

describe('Trace', () => {
  const tmpDirs: string[] = []
  async function makeTmpDir() {
    const dir = await mkdtemp(join(tmpdir(), 'json-reporter'))
    tmpDirs.push(dir)
    return dir
  }

  beforeEach(() => {
    initializeTraceState({
      lastId: 0,
      shouldSaveTraceEvents: true,
    })
    clearTraceEvents()
    // `traceGlobals` outlives each test, so reset what these tests set.
    setGlobal('distDir', undefined)
    setGlobal('phase', undefined)
  })

  afterAll(async () => {
    await Promise.all(
      tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    )
  })

  describe('Tracer', () => {
    it('traces a block of code', async () => {
      const tmpDir = await makeTmpDir()
      setGlobal('distDir', tmpDir)
      setGlobal('phase', 'anything')

      const root = trace('root-span', undefined, {
        'some-tag': 'some-value',
      })
      root.traceChild('child-span').traceFn(() => null)
      await root.traceChild('async-child-span').traceAsyncFn(async () => {
        const delayedPromise = new Promise((resolve) => {
          setTimeout(resolve, 100)
        })
        await delayedPromise
      })
      root.stop()
      const traceEvents = getTraceEvents()
      expect(traceEvents.length).toEqual(3)
      expect(traceEvents[0].name).toEqual('child-span')
      expect(traceEvents[1].name).toEqual('async-child-span')
      expect(traceEvents[2].name).toEqual('root-span')

      // Check that the serialized .next/trace file looks correct.
      flushAllTraces()
      const serializedTraces = readSpans(join(tmpDir, 'trace'))
      expect(serializedTraces).toMatchObject([
        {
          id: 2,
          name: 'child-span',
          parentId: 1,
          startTime: expect.any(Number),
          timestamp: expect.any(Number),
          duration: expect.any(Number),
          tags: {},
        },
        {
          id: 3,
          name: 'async-child-span',
          parentId: 1,
          startTime: expect.any(Number),
          timestamp: expect.any(Number),
          duration: expect.any(Number),
          tags: {},
        },
        {
          id: 1,
          name: 'root-span',
          startTime: expect.any(Number),
          timestamp: expect.any(Number),
          duration: expect.any(Number),
          tags: {
            'some-tag': 'some-value',
          },
        },
      ])
    })

    // Builds flush repeatedly -- after each compilation, and again at the
    // end -- so every flush must leave the file usable.
    it('writes buffered spans on each flush', async () => {
      const tmpDir = await makeTmpDir()
      setGlobal('distDir', tmpDir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      const reporter = createJsonReporter({
        filename: 'trace',
        sizeLimit: Infinity,
      })
      const file = join(tmpDir, 'trace')

      reporter.report(traceEvent('first'))
      reporter.flushAll()
      expect(readSpanNames(file)).toEqual(['first'])

      // A flush with nothing buffered is harmless.
      reporter.report(traceEvent('second'))
      reporter.flushAll()
      reporter.flushAll()
      expect(readSpanNames(file)).toEqual(['first', 'second'])
    })

    it('flushes on its own once the buffer fills', async () => {
      const tmpDir = await makeTmpDir()
      setGlobal('distDir', tmpDir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      const reporter = createJsonReporter({
        filename: 'trace',
        sizeLimit: Infinity,
      })
      const file = join(tmpDir, 'trace')

      // Each event encodes to ~100 bytes, so this far exceeds the buffer.
      for (let i = 0; i < 2000; i++) {
        reporter.report(traceEvent(`span-${i}`))
      }
      expect(readSpanNames(file).length).toBeGreaterThan(0)

      reporter.flushAll()
      expect(readSpanNames(file).length).toBe(2000)
    })

    it('truncates in production but appends in development', async () => {
      const tmpDir = await makeTmpDir()
      setGlobal('distDir', tmpDir)
      const file = join(tmpDir, 'trace')

      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      const build = createJsonReporter({
        filename: 'trace',
        sizeLimit: Infinity,
      })
      build.report(traceEvent('from-build'))
      build.flushAll()
      expect(readSpanNames(file)).toEqual(['from-build'])

      // A second production reporter starts the file over.
      const rebuild = createJsonReporter({
        filename: 'trace',
        sizeLimit: Infinity,
      })
      rebuild.report(traceEvent('from-rebuild'))
      rebuild.flushAll()
      expect(readSpanNames(file)).toEqual(['from-rebuild'])

      // Dev keeps accumulating across sessions instead.
      setGlobal('phase', PHASE_DEVELOPMENT_SERVER)
      const dev = createJsonReporter({ filename: 'trace', sizeLimit: Infinity })
      dev.report(traceEvent('from-dev'))
      dev.flushAll()
      expect(readSpanNames(file)).toEqual(['from-rebuild', 'from-dev'])
    })

    // The dev limit is per session: opening an existing trace must not
    // rotate away previous sessions' spans.
    it('does not rotate an existing file on startup', async () => {
      const tmpDir = await makeTmpDir()
      setGlobal('distDir', tmpDir)
      setGlobal('phase', PHASE_DEVELOPMENT_SERVER)
      const file = join(tmpDir, 'trace')

      const first = createJsonReporter({
        filename: 'trace',
        sizeLimit: Infinity,
      })
      first.report(traceEvent('from-first-session'))
      first.flushAll()
      const bytesOnDisk = readFileSync(file, 'utf-8').length

      // Room for this session's line but not the existing file too, so
      // seeding `size` from disk would rotate and lose the first session.
      const second = createJsonReporter({
        filename: 'trace',
        sizeLimit: bytesOnDisk + 10,
      })
      second.report(traceEvent('from-second-session'))
      second.flushAll()

      expect(readSpanNames(file)).toEqual([
        'from-first-session',
        'from-second-session',
      ])
    })

    // The limit is counted in UTF-8 bytes: counting UTF-16 code units instead
    // lets a non-ASCII trace reach ~3x the configured cap.
    it('starts the file over once it exceeds the size limit', async () => {
      const tmpDir = await makeTmpDir()
      setGlobal('distDir', tmpDir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      const file = join(tmpDir, 'trace')

      // 200 CJK characters: 200 code units, but 600 UTF-8 bytes, so a limit
      // of 1024 fits one of these lines and not two.
      const first = '第'.repeat(200)
      const second = '弐'.repeat(200)
      const limit = 1024
      const reporter = createJsonReporter({
        filename: 'trace',
        sizeLimit: limit,
      })

      reporter.report(traceEvent(first))
      reporter.flushAll()
      expect(readSpanNames(file)).toEqual([first])

      reporter.report(traceEvent(second))
      reporter.flushAll()
      expect(readSpanNames(file)).toEqual([second])
      expect(
        Buffer.byteLength(readFileSync(file, 'utf-8'), 'utf8')
      ).toBeLessThanOrEqual(limit)
    })

    // A truncated batch fails quietly: the last line has no newline, so
    // readers skip it and those spans simply vanish.
    it('writes complete batches at every buffer boundary', async () => {
      const tmpDir = await makeTmpDir()
      setGlobal('distDir', tmpDir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)

      // Equal-sized events tile the buffer, so each length puts a batch
      // boundary at a different offset. Sweeping rather than picking one
      // length because the encoded size shifts with `traceId` ($TRACE_ID).
      // 200 events of any of these sizes overflows the buffer several times.
      for (let length = 100; length < 260; length++) {
        const reporter = createJsonReporter({
          filename: `trace-${length}`,
          sizeLimit: Infinity,
        })
        const names: string[] = []
        for (let i = 0; i < 200; i++) {
          const name = 'n'.repeat(length)
          names.push(name)
          reporter.report(traceEvent(name))
        }
        reporter.flushAll()

        const written = join(tmpDir, `trace-${length}`)
        expect(readFileSync(written, 'utf-8').endsWith(']\n')).toBe(true)
        expect(readSpanNames(written)).toEqual(names)
      }
    })

    it('writes an event too large to buffer', async () => {
      const tmpDir = await makeTmpDir()
      setGlobal('distDir', tmpDir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      const reporter = createJsonReporter({
        filename: 'trace',
        sizeLimit: Infinity,
      })
      const file = join(tmpDir, 'trace')

      // Far larger than the buffer.
      const huge = 'x'.repeat(100 * 1024)
      reporter.report(traceEvent('before-huge'))
      reporter.report(traceEvent(huge))
      reporter.report(traceEvent('after-huge'))
      reporter.flushAll()

      expect(readSpanNames(file)).toEqual(['before-huge', huge, 'after-huge'])
    })

    // `Buffer.write` stops at the last whole character, so an event that
    // overruns the buffer reports a count short of the capacity. Treating
    // that as complete stores a JSON string with no closing quote, which
    // breaks the whole line.
    it('never stores a partially encoded multi-byte event', async () => {
      const tmpDir = await makeTmpDir()
      setGlobal('distDir', tmpDir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)

      // Sweep name lengths so events land at every offset relative to the
      // buffer boundary, mixing 1-, 3- and 4-byte characters.
      for (let length = 1; length < 120; length++) {
        const reporter = createJsonReporter({
          filename: `trace-${length}`,
          sizeLimit: Infinity,
        })
        const names: string[] = []
        for (let i = 0; i < 400; i++) {
          const name = `${'第'.repeat(length)}😀${'a'.repeat(i % 7)}`
          names.push(name)
          reporter.report(traceEvent(name))
        }
        reporter.flushAll()

        expect(readSpanNames(join(tmpDir, `trace-${length}`))).toEqual(names)
      }
    })

    // Tracing is diagnostic: a full disk should cost spans, not the build.
    it('keeps tracing when a write fails', async () => {
      const tmpDir = await makeTmpDir()
      setGlobal('distDir', tmpDir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      const reporter = createJsonReporter({
        filename: 'trace',
        sizeLimit: Infinity,
      })
      const file = join(tmpDir, 'trace')

      reporter.report(traceEvent('before-failure'))
      reporter.flushAll()

      const writeSync = jest.spyOn(fs, 'writeSync').mockImplementation(() => {
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' })
      })
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {})
      try {
        reporter.report(traceEvent('during-failure'))
        expect(() => reporter.flushAll()).not.toThrow()
        expect(consoleLog).toHaveBeenCalled()
      } finally {
        consoleLog.mockRestore()
        writeSync.mockRestore()
      }

      reporter.report(traceEvent('after-failure'))
      reporter.flushAll()
      expect(readSpanNames(file)).toEqual(['before-failure', 'after-failure'])
    })
  })

  describe('Worker', () => {
    it('exports and initializes trace state', () => {
      const root = trace('root-span')
      expect(root.getId()).toEqual(1)
      const traceState = exportTraceState()
      expect(traceState.lastId).toEqual(1)
      initializeTraceState({
        lastId: 101,
      })
      const span = trace('another-span')
      expect(span.getId()).toEqual(102)
    })

    it('trace data is serializable to a worker', async () => {
      const root = trace('root-span')
      root.traceChild('child-span').traceFn(() => null)
      root.stop()
      const traceEvents = getTraceEvents()
      expect(traceEvents.length).toEqual(2)
      // This is a proxy check to make sure the object would be serializable
      // to a worker. It will fail if the data contains some unserializable
      // objects like BigInt.
      const clone = JSON.parse(JSON.stringify(traceEvents))
      expect(clone).toEqual(traceEvents)
    })

    it('correctly reports trace data from multiple workers', () => {
      // This test simulates workers creating traces and propagating them
      // back to the main process for recording. It doesn't use
      // actual workers since they are more difficult to set up in tests.
      initializeTraceState({
        lastId: 5,
        defaultParentSpanId: 1,
        shouldSaveTraceEvents: true,
      })
      const worker1Span = trace('worker1')
      worker1Span.traceChild('webpack-compilation1').traceFn(() => null)
      worker1Span.stop()
      const worker1Traces = getTraceEvents()
      expect(worker1Traces.length).toEqual(2)

      // Repeat for a second worker.
      clearTraceEvents()
      initializeTraceState({
        lastId: 10,
        defaultParentSpanId: 1,
        shouldSaveTraceEvents: true,
      })
      const worker2Span = trace('worker2')
      worker2Span.traceChild('webpack-compilation2').traceFn(() => null)
      worker2Span.stop()
      const worker2Traces = getTraceEvents()
      expect(worker2Traces.length).toEqual(2)

      // Now simulate the traces in the main process and record the traces
      // from each worker.
      clearTraceEvents()
      initializeTraceState({
        lastId: 0,
        shouldSaveTraceEvents: true,
      })
      const root = trace('next-build')
      root.traceChild('some-child-span').traceFn(() => null)
      recordTraceEvents(worker1Traces)
      expect(exportTraceState().lastId).toEqual(8)
      recordTraceEvents(worker2Traces)
      expect(exportTraceState().lastId).toEqual(13)
      root.traceChild('another-child-span').traceFn(() => null)
      root.stop()

      // Check that the final output looks correct.
      const allTraces = getTraceEvents()
      expect(allTraces.length).toEqual(7)
      const firstSpan = allTraces[0]
      expect(firstSpan.name).toEqual('some-child-span')
      expect(firstSpan.id).toEqual(2)
      expect(firstSpan.parentId).toEqual(1)

      const worker1Child = allTraces[1]
      expect(worker1Child.name).toEqual('webpack-compilation1')
      expect(worker1Child.id).toEqual(7)
      expect(worker1Child.parentId).toEqual(6)
      const worker1Root = allTraces[2]
      expect(worker1Root.name).toEqual('worker1')
      expect(worker1Root.id).toEqual(6)
      expect(worker1Root.parentId).toEqual(1)

      const worker2Child = allTraces[3]
      expect(worker2Child.name).toEqual('webpack-compilation2')
      expect(worker2Child.id).toEqual(12)
      expect(worker2Child.parentId).toEqual(11)
      const worker2Root = allTraces[4]
      expect(worker2Root.name).toEqual('worker2')
      expect(worker2Root.id).toEqual(11)
      expect(worker2Root.parentId).toEqual(1)

      const lastChildSpan = allTraces[5]
      expect(lastChildSpan.name).toEqual('another-child-span')
      expect(lastChildSpan.id).toEqual(14)
      expect(lastChildSpan.parentId).toEqual(1)

      const rootSpan = allTraces[6]
      expect(rootSpan.name).toEqual('next-build')
      expect(rootSpan.id).toEqual(1)
      expect(rootSpan.parentId).toBeUndefined()
    })
  })
})
