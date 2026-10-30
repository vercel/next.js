/** @jest-environment node */

import { mkdtemp, rm } from 'fs/promises'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { LocalSpan, emitLocalSpans } from './local-span'
import {
  Span,
  clearTraceEvents,
  closeAllTraces,
  flushAllTraces,
  getTraceEvents,
  initializeTraceState,
  recordTraceEvents,
} from '../../trace/trace'
import { setGlobal } from '../../trace/shared'
import { PHASE_PRODUCTION_BUILD } from './constants'
import { createLocalSpan } from '../../server/lib/trace/local-span-recorder'
import {
  recordSpans,
  runWithLocalSpanSink,
  setLocalSpanExporter,
  setSpanRecorderForTest,
  type SpanStoreRecord,
} from '../../server/lib/trace/span-store'

type Completion = { name: string; start: bigint; end: bigint; tags: Tags }
type Tags = Record<string, unknown>

class TestSpan extends LocalSpan<Tags, bigint, bigint, Completion> {
  constructor(subscriber: (records: readonly Completion[]) => void) {
    super('test', { raw: [null, { nested: true }] }, 1000n, subscriber)
  }

  setAttribute(key: string, value: unknown) {
    this.setLocalAttribute(key, value)
  }

  end(time: bigint) {
    this.finish(time)
  }

  protected onEnd(end: bigint) {
    this.emit({
      name: this.name,
      start: this.startTime,
      end,
      tags: this.attributes,
    })
  }
}

const originalDevServer = process.env.__NEXT_DEV_SERVER

describe('shared local span recording', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    initializeTraceState({ lastId: 0, shouldSaveTraceEvents: true })
    clearTraceEvents()
    setGlobal('distDir', undefined)
    setGlobal('phase', undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    closeAllTraces()
    setGlobal('distDir', undefined)
    setGlobal('phase', undefined)
    setSpanRecorderForTest(undefined)
    setLocalSpanExporter(undefined)
    if (originalDevServer === undefined) delete process.env.__NEXT_DEV_SERVER
    else process.env.__NEXT_DEV_SERVER = originalDevServer
  })

  it('shares capture, attribute mutation, end-once and completion emission across both facades', () => {
    const finish = jest.spyOn(LocalSpan.prototype as any, 'finish')
    const mutate = jest.spyOn(LocalSpan.prototype as any, 'setLocalAttribute')
    const emit = jest.spyOn(LocalSpan.prototype as any, 'emit')
    const records: SpanStoreRecord[] = []
    setSpanRecorderForTest((record) => records.push(record))
    const tooling = new Span({ name: 'tooling', startTime: 1000n })
    const request = createLocalSpan({
      name: 'request',
      startTime: 1700000000000,
    })
    expect(tooling).toBeInstanceOf(LocalSpan)
    expect(request).toBeInstanceOf(LocalSpan)
    tooling.setAttribute('value', { nested: [false, null] })
    request.setAttribute('value', 'request-value')
    tooling.stop(5000n)
    request.end(1700000000010)
    tooling.stop(9000n)
    request.end(1700000000020)
    expect(finish).toHaveBeenCalledTimes(4)
    expect(mutate).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenCalledTimes(2)
    expect(getTraceEvents()).toEqual([
      expect.objectContaining({
        name: 'tooling',
        timestamp: 1,
        duration: 4,
        tags: { value: { nested: [false, null] } },
      }),
    ])
    expect(records).toEqual([
      expect.objectContaining({
        name: 'request',
        startTime: 1700000000000,
        durationMs: 10,
        attributes: { value: 'request-value' },
      }),
    ])
  })

  it('captures raw tags and clocks without OTel normalization', () => {
    const records: Completion[] = []
    const span = new TestSpan((batch) => records.push(...batch))
    span.setAttribute('raw', {
      array: [null, false, 3, 'four'],
      unset: undefined,
    })
    span.end(9007199254740993123n)
    span.end(9007199254740993999n)
    expect(records).toEqual([
      {
        name: 'test',
        start: 1000n,
        end: 9007199254740993123n,
        tags: { raw: { array: [null, false, 3, 'four'], unset: undefined } },
      },
    ])
  })

  it('marks completion before notifying a reentrant or throwing subscriber', () => {
    const error = new Error('subscriber failed')
    const subscriber = jest.fn(() => {
      span.end(3000n)
      throw error
    })
    const span = new TestSpan(subscriber)
    expect(() => span.end(2000n)).toThrow(error)
    span.end(4000n)
    expect(subscriber).toHaveBeenCalledTimes(1)
  })

  it('accepts completed batches without constructing live spans', () => {
    const subscriber = jest.fn()
    const records = [{ name: 'observed', originalTimestamp: 42 }]
    emitLocalSpans(records, subscriber)
    expect(subscriber).toHaveBeenCalledWith(records)
    expect(subscriber.mock.calls[0][0]).toBe(records)
    expect(() => emitLocalSpans(records, undefined)).not.toThrow()
  })

  it('writes legacy files directly without request recording or an application provider', async () => {
    delete process.env.__NEXT_DEV_SERVER
    const requestExporter = jest.fn()
    setLocalSpanExporter({ isEnabled: () => true, export: requestExporter })
    const dir = await mkdtemp(join(tmpdir(), 'shared-local-span-'))
    try {
      setGlobal('distDir', dir)
      setGlobal('phase', PHASE_PRODUCTION_BUILD)
      const span = new Span({
        name: 'next-build',
        startTime: 1234567890123456789n,
        wallStartTimeMs: 1700000000000,
        attrs: { object: { nested: [false, null, 3] }, unset: undefined },
      })
      span.setAttribute('null', null)
      span.stop(1234567890123466789n)
      flushAllTraces()
      const expected = {
        name: 'next-build',
        id: 1,
        timestamp: 1234567890123456,
        duration: 10,
        startTime: 1700000000000,
        tags: { object: { nested: [false, null, 3] }, null: null },
      }
      for (const file of ['trace', 'trace-build']) {
        const lines = readFileSync(join(dir, file), 'utf8').trim().split('\n')
        const records = lines.flatMap((line) => JSON.parse(line))
        expect(records).toEqual([expect.objectContaining(expected)])
      }
      expect(requestExporter).not.toHaveBeenCalled()
    } finally {
      closeAllTraces()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not broadcast tooling records into a scoped request sink', () => {
    const sink = jest.fn()
    const exporter = jest.fn()
    setLocalSpanExporter({ isEnabled: () => true, export: exporter })
    let request: ReturnType<typeof createLocalSpan>
    runWithLocalSpanSink(sink, () => {
      request = createLocalSpan({ name: 'scoped request' })
      new Span({ name: 'tooling' }).stop()
    })
    request!.end()
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'scoped request' })
    )
    expect(exporter).not.toHaveBeenCalled()
    expect(getTraceEvents().map((record) => record.name)).toEqual(['tooling'])
  })

  it('keeps emitted request data after releasing the live span and ignoring late mutations', () => {
    const records: SpanStoreRecord[] = []
    setSpanRecorderForTest((record) => records.push(record))
    const span = createLocalSpan({
      name: 'request',
      attributes: { initial: true },
    })
    span.addEvent('event', { value: 'captured' })
    span.end()
    span.updateName('late name').setAttribute('late', true)
    expect(records[0]).toMatchObject({
      name: 'request',
      attributes: { initial: true },
      events: [{ name: 'event', attributes: { value: 'captured' } }],
    })
    expect((span as any).name).toBe('')
    expect((span as any).subscriber).toBeUndefined()
  })

  it('preserves the distinct post-end mutation policies of the facades', () => {
    const records: SpanStoreRecord[] = []
    setSpanRecorderForTest((record) => records.push(record))
    const tooling = new Span({ name: 'tooling' })
    const request = createLocalSpan({ name: 'request' })
    tooling.stop()
    request.end()
    tooling.setAttribute('late', { raw: true })
    request.setAttribute('late', true)
    // Legacy saved tooling events retain the mutable tag object. Request
    // completions survive reference release and reject subsequent API writes.
    expect(getTraceEvents()[0].tags).toEqual({ late: { raw: true } })
    expect(records[0].attributes).toBeUndefined()
  })

  it('emits locally and releases references even when a request delegate throws', () => {
    const records: SpanStoreRecord[] = []
    setSpanRecorderForTest((record) => records.push(record))
    const error = new Error('delegate end failed')
    const delegate = {
      spanContext: () => ({ traceId: 'trace', spanId: 'span', traceFlags: 0 }),
      end: jest.fn(() => {
        throw error
      }),
    }
    const request = createLocalSpan({
      name: 'request',
      delegateSpan: delegate as any,
    })
    const endTime: [number, number] = [1700000000, 123456789]
    expect(() => request.end(endTime)).toThrow(error)
    request.end()
    expect(delegate.end).toHaveBeenCalledTimes(1)
    expect(delegate.end).toHaveBeenCalledWith(endTime)
    expect(records).toEqual([expect.objectContaining({ name: 'request' })])
    expect((request as any).subscriber).toBeUndefined()
    expect((request as any).delegateSpan).toBeUndefined()
  })

  it('retains scoped sink errors while releasing the ended request payload', () => {
    const error = new Error('scoped sink failed')
    let request: ReturnType<typeof createLocalSpan>
    runWithLocalSpanSink(
      () => {
        throw error
      },
      () => {
        request = createLocalSpan({
          name: 'request',
          attributes: { payload: 'released' },
        })
      }
    )
    expect(() => request!.end()).toThrow(error)
    expect(request!.isRecording()).toBe(false)
    expect((request! as any).attributes).toEqual({})
    expect((request! as any).subscriber).toBeUndefined()
    expect(() => request!.end()).not.toThrow()
  })

  it('preserves batch identity and ordering for imported request observations', () => {
    const exporter = jest.fn()
    setLocalSpanExporter({ isEnabled: () => true, export: exporter })
    const records = [
      { name: 'browser first', timestamp: 1 },
      { name: 'browser second', timestamp: 2 },
    ]
    recordSpans(records)
    expect(exporter).toHaveBeenCalledTimes(1)
    expect(exporter.mock.calls[0][0]).toBe(records)
  })

  it('imports completed tooling records with original timing and numeric parentage', () => {
    const records = [
      {
        name: 'worker',
        id: 20,
        parentId: 2,
        timestamp: 123,
        duration: 4,
        tags: { raw: [null, true] },
      },
    ]
    recordTraceEvents(records)
    expect(getTraceEvents()).toEqual(records)
    expect(new Span({ name: 'after import' }).getId()).toBe(22)
  })
})
