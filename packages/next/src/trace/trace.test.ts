import { reporter } from './report'
import {
  clearTraceEvents,
  exportTraceState,
  getTraceEvents,
  initializeTraceState,
  recordTracesFromWorker,
  trace,
} from './trace'
import type { TraceEvent, TraceState } from './types'

describe('Trace', () => {
  beforeEach(() => {
    initializeTraceState({
      lastId: 0,
    })
    clearTraceEvents()
  })

  describe('Tracer', () => {
    it('traces a block of code', async () => {
      const root = trace('root-span')
      root.traceChild('child-span').traceFn(() => null)
      await root.traceChild('async-child-span').traceAsyncFn(async () => {
        const delayedPromise = new Promise((resolve) => {
          setTimeout(resolve, 100)
        })
        await delayedPromise
      })
      root.stop()
      const traceEvents = reporter.getTraceEvents()
      expect(traceEvents.length).toEqual(3)
    })
  })

  describe('Worker', () => {
    it('exports and initializes trace state', () => {
      const root = trace('root-span')
      expect(root.id).toEqual(1)
      const traceState = exportTraceState()
      expect(traceState.lastId).toEqual(1)
      initializeTraceState({
        lastId: 101,
      })
      const span = trace('another-span')
      expect(span.id).toEqual(102)
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
  })
})
