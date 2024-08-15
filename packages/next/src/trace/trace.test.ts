import { mkdtemp, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
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

describe('Trace', () => {
  beforeEach(() => {
    initializeTraceState({
      lastId: 0,
      shouldSaveTraceEvents: true,
    })
    clearTraceEvents()
  })

  describe('Tracer', () => {
    it('traces a block of code', async () => {
      const tmpDir = await mkdtemp(join(tmpdir(), 'json-reporter'))
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
      await flushAllTraces()
      const traceFilename = join(tmpDir, 'trace')
      const serializedTraces = JSON.parse(
        await readFile(traceFilename, 'utf-8')
      )
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
