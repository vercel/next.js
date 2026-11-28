/**
 * @jest-environment node
 */

import type { Span, Tracer } from '@opentelemetry/api'
import { afterRegistration } from 'next/dist/server/lib/router-utils/instrumentation-node-extensions'
import {
  workUnitAsyncStorage,
  type WorkUnitStore,
} from 'next/dist/server/app-render/work-unit-async-storage.external'

const {
  ROOT_CONTEXT,
  trace,
}: typeof import('@opentelemetry/api') = require('next/dist/compiled/@opentelemetry/api')

jest.mock(
  'next/dist/server/app-render/work-unit-async-storage.external',
  () => {
    const { AsyncLocalStorage } = require('node:async_hooks')
    return { workUnitAsyncStorage: new AsyncLocalStorage() }
  }
)

const store = { type: 'prerender' } as WorkUnitStore

function setup() {
  const span = trace.wrapSpanContext({
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    traceFlags: 1,
  })
  const contexts: (WorkUnitStore | undefined)[] = []
  const end = jest.fn(function (
    this: Span,
    _endTime?: Parameters<Span['end']>[0]
  ) {
    expect(this).toBe(span)
    contexts.push(workUnitAsyncStorage.getStore())
    void Promise.resolve().then(() => {
      contexts.push(workUnitAsyncStorage.getStore())
    })
  })
  span.end = end
  const tracer = {
    startSpan: () => span,
    startActiveSpan: (...args: any[]) => args[args.length - 1](span),
  } as Tracer
  expect(trace.setGlobalTracerProvider({ getTracer: () => tracer })).toBe(true)
  afterRegistration()
  return { tracer: trace.getTracer('otel-span-end'), span, end, contexts }
}

afterEach(() => trace.disable())

describe.each(['startSpan', 'startActiveSpan'] as const)('%s', (method) => {
  it.each([false, true])(
    'ends outside the work unit, including when created in a work unit: %s',
    async (inWorkUnit) => {
      const { tracer, span, end, contexts } = setup()
      const create = () =>
        method === 'startSpan'
          ? tracer.startSpan('test')
          : tracer.startActiveSpan('test', (activeSpan) => activeSpan)
      const created = inWorkUnit
        ? workUnitAsyncStorage.run(store, create)
        : create()
      expect(created).toBe(span)
      const endTime = [123, 456] as [number, number]
      workUnitAsyncStorage.run(store, () => {
        created.end(endTime)
        expect(workUnitAsyncStorage.getStore()).toBe(store)
      })
      await Promise.resolve()
      expect(end).toHaveBeenCalledTimes(1)
      expect(end).toHaveBeenCalledWith(endTime)
      expect(contexts).toEqual([undefined, undefined])
    }
  )
})

it('restores the work unit for every startActiveSpan overload', async () => {
  const { tracer, span } = setup()
  const fn = jest.fn(async (activeSpan: Span) => {
    expect(activeSpan).toBe(span)
    expect(workUnitAsyncStorage.getStore()).toBe(store)
    activeSpan.end()
    await Promise.resolve()
    expect(workUnitAsyncStorage.getStore()).toBe(store)
    return 'result'
  })
  const context = trace.setSpanContext(ROOT_CONTEXT, span.spanContext())
  await workUnitAsyncStorage.run(store, async () => {
    expect(await tracer.startActiveSpan('test', fn)).toBe('result')
    expect(await tracer.startActiveSpan('test', {}, fn)).toBe('result')
    expect(await tracer.startActiveSpan('test', {}, context, fn)).toBe('result')
  })
  expect(fn).toHaveBeenCalledTimes(3)
})

it('does not wrap an SDK span more than once', () => {
  const { tracer, span } = setup()
  tracer.startSpan('test')
  const end = span.end
  tracer.startSpan('test')
  tracer.startActiveSpan('test', () => {})
  expect(span.end).toBe(end)
})
