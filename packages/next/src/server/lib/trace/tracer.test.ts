/**
 * @jest-environment node
 */

import type {
  Context,
  ContextManager,
  TextMapGetter,
  TextMapPropagator,
} from '@opentelemetry/api'
import type { WorkStore } from '../../app-render/work-async-storage.external'
import type { WorkUnitStore } from '../../app-render/work-unit-async-storage.external'
import {
  ROOT_CONTEXT,
  context,
  createContextKey,
  propagation,
  trace,
} from '@opentelemetry/api'

import { setSpanRecorderForTest, type SpanStoreRecord } from './span-store'
import {
  registerLocalSpanRecorder,
  traceLocalSpan,
} from './local-span-recorder'
import {
  AppRouteRouteModuleSpan,
  AppRenderSpan,
  BaseServerSpan,
  InstrumentationSpan,
  LoadComponentsSpan,
  NextNodeServerSpan,
  NodeSpan,
  RouteModuleSpan,
} from './constants'
import { SpanKind, SpanStatusCode, getTracer } from './tracer'

const customContextKey = createContextKey('next.tracer.test.custom-context')
const originalRequestInsights = process.env.__NEXT_REQUEST_INSIGHTS
const originalDevServer = process.env.__NEXT_DEV_SERVER
const originalOtelVerbose = process.env.NEXT_OTEL_VERBOSE
const spanRecords: SpanStoreRecord[] = []

function getSpanRecords(filter: { name?: string } = {}): SpanStoreRecord[] {
  return spanRecords.filter(
    (span) => filter.name === undefined || span.name === filter.name
  )
}

const getter: TextMapGetter<Record<string, string | undefined>> = {
  keys: (carrier) => Object.keys(carrier),
  get: (carrier, key) => carrier[key],
}

class TestContextManager implements ContextManager {
  private currentContext: Context = ROOT_CONTEXT

  active(): Context {
    return this.currentContext
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    newContext: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const previousContext = this.currentContext
    this.currentContext = newContext
    try {
      return fn.apply(thisArg, args)
    } finally {
      this.currentContext = previousContext
    }
  }

  bind<T>(bindContext: Context, target: T): T {
    if (typeof target !== 'function') {
      return target
    }

    return ((...args: unknown[]) => {
      return this.with(
        bindContext,
        target as (...args: unknown[]) => unknown,
        undefined,
        ...args
      )
    }) as T
  }

  enable(): this {
    return this
  }

  disable(): this {
    this.currentContext = ROOT_CONTEXT
    return this
  }
}

class CustomPropagator implements TextMapPropagator {
  fields(): string[] {
    return ['x-custom']
  }

  inject(): void {}

  extract(
    extractedContext: Context,
    carrier: Record<string, string | undefined>,
    mapGetter: TextMapGetter<Record<string, string | undefined>>
  ): Context {
    const value = mapGetter.get(carrier, 'x-custom')
    if (!value || Array.isArray(value)) {
      return extractedContext
    }

    return extractedContext.setValue(customContextKey, value)
  }
}

describe('withPropagatedContext', () => {
  beforeEach(() => {
    context.disable()
    propagation.disable()
    context.setGlobalContextManager(new TestContextManager())
    propagation.setGlobalPropagator(new CustomPropagator())
  })

  afterEach(() => {
    propagation.disable()
    context.disable()
  })

  it('merges extracted context in force mode when no remote span exists', () => {
    const activeSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
      isRemote: false,
    })
    const activeContext = trace.setSpan(ROOT_CONTEXT, activeSpan)

    const result = context.with(activeContext, () =>
      getTracer().withPropagatedContext(
        { 'x-custom': 'custom1' },
        () => {
          const scopedContext = context.active()
          return {
            customValue: scopedContext.getValue(customContextKey),
            activeSpanId: trace.getSpanContext(scopedContext)?.spanId,
          }
        },
        getter,
        true
      )
    )

    expect(result).toEqual({
      customValue: 'custom1',
      activeSpanId: '0123456789abcdef',
    })
  })
})

describe('local span recording', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    delete process.env.__NEXT_REQUEST_INSIGHTS
    delete process.env.NEXT_OTEL_VERBOSE
    setSpanRecorderForTest((span) => spanRecords.push(span))
    registerLocalSpanRecorder()
  })

  afterEach(() => {
    if (originalRequestInsights === undefined) {
      delete process.env.__NEXT_REQUEST_INSIGHTS
    } else {
      process.env.__NEXT_REQUEST_INSIGHTS = originalRequestInsights
    }
    if (originalDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = originalDevServer
    }
    if (originalOtelVerbose === undefined) {
      delete process.env.NEXT_OTEL_VERBOSE
    } else {
      process.env.NEXT_OTEL_VERBOSE = originalOtelVerbose
    }
    context.disable()
    trace.disable()
    setSpanRecorderForTest(undefined)
    spanRecords.length = 0
  })

  it('does not mirror spans by default', () => {
    setSpanRecorderForTest(undefined)

    const result = getTracer().trace(NodeSpan.runHandler, () => 'result')

    expect(result).toBe('result')
    expect(getSpanRecords()).toEqual([])
  })

  it('records non-vanilla trace and wrapped spans for request insights', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    getTracer().trace(BaseServerSpan.render, () => undefined)
    const wrappedLoadComponents = getTracer().wrap(
      LoadComponentsSpan.loadComponents,
      () => undefined
    )
    wrappedLoadComponents()

    expect(getSpanRecords()).toEqual([
      expect.objectContaining({
        name: BaseServerSpan.render,
        attributes: expect.objectContaining({
          'next.span_category': 'nextjs',
        }),
      }),
      expect.objectContaining({
        name: LoadComponentsSpan.loadComponents,
        attributes: expect.objectContaining({
          'next.span_category': 'nextjs',
        }),
      }),
    ])
  })

  it('only exports non-vanilla spans when verbose tracing is enabled', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const exportedSpans: string[] = []
    const delegateSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    })
    trace.setGlobalTracerProvider({
      getTracer() {
        return {
          startSpan(name: string) {
            exportedSpans.push(name)
            return delegateSpan
          },
          startActiveSpan(...args: unknown[]) {
            exportedSpans.push(args[0] as string)
            const callback = args.at(-1) as (
              span: typeof delegateSpan
            ) => unknown
            return callback(delegateSpan)
          },
        }
      },
    })

    getTracer().trace(BaseServerSpan.render, () => undefined)
    expect(exportedSpans).toEqual([])

    getTracer().trace(NodeSpan.runHandler, () => undefined)
    expect(exportedSpans).toEqual([NodeSpan.runHandler])

    getTracer().trace(LoadComponentsSpan.loadRouteModule, () => undefined)
    expect(exportedSpans).toEqual([
      NodeSpan.runHandler,
      LoadComponentsSpan.loadRouteModule,
    ])

    getTracer().trace(RouteModuleSpan.prepare, () => undefined)
    getTracer().trace(AppRouteRouteModuleSpan.loadUserland, () => undefined)
    getTracer().trace(RouteModuleSpan.loadManifests, () => undefined)
    getTracer().trace(InstrumentationSpan.register, () => undefined)
    getTracer().trace(InstrumentationSpan.loadModule, () => undefined)
    expect(exportedSpans).toEqual([
      NodeSpan.runHandler,
      LoadComponentsSpan.loadRouteModule,
      RouteModuleSpan.prepare,
      AppRouteRouteModuleSpan.loadUserland,
      InstrumentationSpan.register,
      InstrumentationSpan.loadModule,
    ])

    process.env.NEXT_OTEL_VERBOSE = '1'
    getTracer().trace(BaseServerSpan.render, () => undefined)
    getTracer().trace(RouteModuleSpan.loadManifests, () => undefined)
    getTracer().trace(InstrumentationSpan.loadModule, () => undefined)
    expect(exportedSpans).toEqual([
      NodeSpan.runHandler,
      LoadComponentsSpan.loadRouteModule,
      RouteModuleSpan.prepare,
      AppRouteRouteModuleSpan.loadUserland,
      InstrumentationSpan.register,
      InstrumentationSpan.loadModule,
      BaseServerSpan.render,
      RouteModuleSpan.loadManifests,
      InstrumentationSpan.loadModule,
    ])
  })

  it('does not record or export hidden spans', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    let receivedSpan: unknown = 'not-called'
    const startSpan = jest.fn()
    const startActiveSpan = jest.fn()
    trace.setGlobalTracerProvider({
      getTracer() {
        return { startSpan, startActiveSpan }
      },
    })

    getTracer().trace(BaseServerSpan.render, { hideSpan: true }, (span) => {
      receivedSpan = span
    })

    expect(receivedSpan).toBeUndefined()
    expect(getSpanRecords()).toEqual([])
    expect(startSpan).not.toHaveBeenCalled()
    expect(startActiveSpan).not.toHaveBeenCalled()
  })

  it('bypasses local span handling outside the dev server', () => {
    delete process.env.__NEXT_DEV_SERVER
    let receivedSpan: unknown = 'not-called'

    const result = getTracer().trace(NodeSpan.runHandler, (span) => {
      receivedSpan = span
      return 'result'
    })

    expect(result).toBe('result')
    expect(receivedSpan).toBeUndefined()
    expect(getSpanRecords()).toEqual([])
  })

  it('records sync trace calls without an OTel provider', () => {
    const result = getTracer().trace(
      NodeSpan.runHandler,
      {
        spanName: 'test.sync',
        attributes: {
          'next.route': '/products/[id]',
        },
      },
      () => 'result'
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.sync' })).toEqual([
      expect.objectContaining({
        name: 'test.sync',
        route: '/products/[id]',
        status: 'ok',
        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
        spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
        durationMs: expect.any(Number),
        attributes: expect.objectContaining({
          'next.route': '/products/[id]',
          'next.span_category': 'nextjs',
          'next.span_name': 'test.sync',
          'next.span_type': NodeSpan.runHandler,
        }),
      }),
    ])
  })

  it('records an explicit end time', () => {
    const startTime = Date.now() - 10
    const endTime = startTime + 5

    getTracer().trace(
      InstrumentationSpan.register,
      { startTime, endTime },
      () => undefined
    )

    expect(getSpanRecords({ name: InstrumentationSpan.register })).toEqual([
      expect.objectContaining({ durationMs: 5 }),
    ])
  })

  it('records app render fetch spans without an OTel provider', async () => {
    const result = await getTracer().trace(
      AppRenderSpan.fetch,
      {
        kind: SpanKind.CLIENT,
        spanName: 'fetch GET https://example.vercel.sh/',
        attributes: {
          'next.span_category': 'application',
          'http.url': 'https://example.vercel.sh/',
          'http.method': 'GET',
          'net.peer.name': 'example.vercel.sh',
        },
      },
      async () => 'response'
    )

    expect(result).toBe('response')
    expect(
      getSpanRecords({ name: 'fetch GET https://example.vercel.sh/' })
    ).toEqual([
      expect.objectContaining({
        name: 'fetch GET https://example.vercel.sh/',
        status: 'ok',
        attributes: expect.objectContaining({
          'next.span_name': 'fetch GET https://example.vercel.sh/',
          'next.span_type': AppRenderSpan.fetch,
          'next.span_category': 'application',
          'http.url': 'https://example.vercel.sh/',
          'http.method': 'GET',
          'net.peer.name': 'example.vercel.sh',
        }),
      }),
    ])
  })

  it('keeps OTel-isolated spans out of the active OTel context', async () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    process.env.NEXT_OTEL_VERBOSE = '1'
    context.disable()
    context.setGlobalContextManager(new TestContextManager())

    const exportedSpans: string[] = []
    const foregroundSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    })
    trace.setGlobalTracerProvider({
      getTracer() {
        return {
          startSpan(name: string) {
            exportedSpans.push(name)
            return foregroundSpan
          },
          startActiveSpan(...args: unknown[]) {
            exportedSpans.push(args[0] as string)
            const callback = args.at(-1) as (
              span: typeof foregroundSpan
            ) => unknown
            return callback(foregroundSpan)
          },
        }
      },
    })

    const foregroundContext = trace.setSpan(ROOT_CONTEXT, foregroundSpan)
    let activeSpanDuringLocalWork
    let activeSpanDuringNestedLocalWork
    let activeSpanDuringNextTrace
    let activeSpanDuringDirectWithSpan

    await context.with(foregroundContext, () =>
      traceLocalSpan(
        { name: 'Instant Insights', parentSpan: null },
        async () => {
          activeSpanDuringLocalWork = trace.getSpan(context.active())
          await traceLocalSpan(
            { name: 'Prepare validation inputs' },
            async () => {
              activeSpanDuringNestedLocalWork = trace.getSpan(context.active())
              getTracer().trace(NextNodeServerSpan.createComponentTree, () => {
                activeSpanDuringNextTrace = trace.getSpan(context.active())
              })
              const directSpan = getTracer().startSpan(
                NextNodeServerSpan.getLayoutOrPageModule
              )
              getTracer().withSpan(directSpan, () => {
                activeSpanDuringDirectWithSpan = trace.getSpan(context.active())
              })
              directSpan.end()
            }
          )
        }
      )
    )

    expect(activeSpanDuringLocalWork).toBe(foregroundSpan)
    expect(activeSpanDuringNestedLocalWork).toBe(foregroundSpan)
    expect(activeSpanDuringNextTrace).toBe(foregroundSpan)
    expect(activeSpanDuringDirectWithSpan).toBe(foregroundSpan)
    expect(exportedSpans).toEqual([])

    const rootRecord = getSpanRecords({ name: 'Instant Insights' })[0]
    const childRecord = getSpanRecords({
      name: 'Prepare validation inputs',
    })[0]
    const nestedNextRecord = getSpanRecords({
      name: NextNodeServerSpan.createComponentTree,
    })[0]
    const directNextRecord = getSpanRecords({
      name: NextNodeServerSpan.getLayoutOrPageModule,
    })[0]

    expect(rootRecord.parentSpanId).toBeUndefined()
    expect(rootRecord.traceId).not.toBe(foregroundSpan.spanContext().traceId)
    expect(childRecord).toEqual(
      expect.objectContaining({
        traceId: rootRecord.traceId,
        parentSpanId: rootRecord.spanId,
      })
    )
    expect(nestedNextRecord).toEqual(
      expect.objectContaining({
        traceId: rootRecord.traceId,
        parentSpanId: childRecord.spanId,
      })
    )
    expect(directNextRecord).toEqual(
      expect.objectContaining({
        traceId: rootRecord.traceId,
        parentSpanId: childRecord.spanId,
      })
    )
  })

  it('mirrors span mutations made through the OTel span API', () => {
    const result = getTracer().trace(
      NodeSpan.runHandler,
      { spanName: 'test.mutated' },
      (span) => {
        span?.setAttribute('http.status_code', 200)
        span?.setAttributes({
          'next.route': '/mutated',
        })
        span?.addEvent('test.event', {
          'next.phase': 'render',
        })
        span?.updateName('test.mutated.updated')
        return 'result'
      }
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.mutated.updated' })).toEqual([
      expect.objectContaining({
        name: 'test.mutated.updated',
        route: '/mutated',
        attributes: expect.objectContaining({
          'http.status_code': 200,
          'next.route': '/mutated',
        }),
        events: [
          expect.objectContaining({
            name: 'test.event',
            attributes: {
              'next.phase': 'render',
            },
          }),
        ],
      }),
    ])
  })

  it('mirrors span status without a thrown error', () => {
    const result = getTracer().trace(
      NodeSpan.runHandler,
      { spanName: 'test.status' },
      (span) => {
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'status failed',
        })
        return 'result'
      }
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.status' })).toEqual([
      expect.objectContaining({
        name: 'test.status',
        status: 'error',
        error: {
          message: 'status failed',
        },
      }),
    ])
  })

  it('records async trace calls when the returned promise settles', async () => {
    const result = await getTracer().trace(
      NodeSpan.runHandler,
      { spanName: 'test.async' },
      async () => {
        await Promise.resolve()
        return 'result'
      }
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.async' })).toEqual([
      expect.objectContaining({
        name: 'test.async',
        status: 'ok',
        durationMs: expect.any(Number),
      }),
    ])
  })

  it('records callback trace calls when done is called', () => {
    const result = getTracer().trace(
      NodeSpan.runHandler,
      { spanName: 'test.callback' },
      (_span, done) => {
        done?.()
        return 'result'
      }
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.callback' })).toEqual([
      expect.objectContaining({
        name: 'test.callback',
        status: 'ok',
        durationMs: expect.any(Number),
      }),
    ])
  })

  it('records callback trace calls consistently with an OTel provider', () => {
    const delegateSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    })
    trace.setGlobalTracerProvider({
      getTracer() {
        return {
          startSpan() {
            return delegateSpan
          },
          startActiveSpan(...args: unknown[]) {
            const callback = args.at(-1) as (
              span: typeof delegateSpan
            ) => unknown
            return callback(delegateSpan)
          },
        }
      },
    })

    const result = getTracer().trace(
      NodeSpan.runHandler,
      { spanName: 'test.callback.provider' },
      (_span, done) => {
        done?.()
        return 'result'
      }
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.callback.provider' })).toEqual([
      expect.objectContaining({
        status: 'ok',
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
      }),
    ])
  })

  it('records direct spans with active local parent identity', () => {
    const parentSpan = getTracer().startSpan(NodeSpan.runHandler, {
      attributes: { 'next.page': 'parent' },
    })
    let childSpanId: string | undefined

    getTracer().withSpan(parentSpan, () => {
      expect(getTracer().getActiveScopeSpan()).toBe(parentSpan)

      const childSpan = getTracer().startSpan(AppRenderSpan.fetch, {
        attributes: {
          'next.page': 'child',
          'next.span_category': 'application',
        },
      })
      childSpanId = childSpan.spanContext().spanId
      childSpan.end()
    })
    parentSpan.end()

    const records = getSpanRecords()
    const parentRecord = records.find(
      (record) => record.attributes?.['next.page'] === 'parent'
    )
    const childRecord = records.find(
      (record) => record.attributes?.['next.page'] === 'child'
    )

    expect(parentRecord).toEqual(
      expect.objectContaining({
        name: NodeSpan.runHandler,
        parentSpanId: undefined,
        attributes: expect.objectContaining({
          'next.span_category': 'nextjs',
        }),
      })
    )
    expect(childRecord).toEqual(
      expect.objectContaining({
        name: AppRenderSpan.fetch,
        spanId: childSpanId,
        traceId: parentRecord?.traceId,
        parentSpanId: parentRecord?.spanId,
        attributes: expect.objectContaining({
          'next.span_category': 'application',
        }),
      })
    )
  })

  it('records thrown errors before rethrowing', () => {
    expect(() =>
      getTracer().trace(NodeSpan.runHandler, { spanName: 'test.error' }, () => {
        throw new Error('boom')
      })
    ).toThrow('boom')

    expect(getSpanRecords({ name: 'test.error' })).toEqual([
      expect.objectContaining({
        name: 'test.error',
        status: 'error',
        error: {
          type: 'Error',
          message: 'boom',
        },
      }),
    ])
  })

  it('groups local spans by existing async storage without adding extra attributes', () => {
    jest.isolateModules(() => {
      const previousAsyncLocalStorage = (globalThis as any).AsyncLocalStorage
      let setIsolatedSpanRecorderForTest:
        | typeof setSpanRecorderForTest
        | undefined
      try {
        const { AsyncLocalStorage } =
          require('node:async_hooks') as typeof import('node:async_hooks')
        ;(globalThis as any).AsyncLocalStorage = AsyncLocalStorage

        const { workAsyncStorage } =
          require('../../app-render/work-async-storage.external') as typeof import('../../app-render/work-async-storage.external')
        const { workUnitAsyncStorage } =
          require('../../app-render/work-unit-async-storage.external') as typeof import('../../app-render/work-unit-async-storage.external')
        ;({ setSpanRecorderForTest: setIsolatedSpanRecorderForTest } =
          require('./span-store') as typeof import('./span-store'))
        setIsolatedSpanRecorderForTest((span) => spanRecords.push(span))
        const { registerLocalSpanRecorder: registerIsolatedLocalSpanRecorder } =
          require('./local-span-recorder') as typeof import('./local-span-recorder')
        registerIsolatedLocalSpanRecorder()
        const { getTracer: getIsolatedTracer } =
          require('./tracer') as typeof import('./tracer')

        const workStore = {
          page: '/products/[id]/page',
          route: '/products/[id]',
          cacheComponentsEnabled: true,
        } as WorkStore
        const requestStore = {
          type: 'request',
          phase: 'render',
          isHmrRefresh: true,
        } as WorkUnitStore

        workAsyncStorage.run(workStore, () =>
          workUnitAsyncStorage.run(requestStore, () => {
            getIsolatedTracer().trace(
              NodeSpan.runHandler,
              { spanName: 'test.als.outer' },
              (outerSpan) => {
                expect(getIsolatedTracer().getActiveScopeSpan()).toBe(outerSpan)
                getIsolatedTracer().trace(
                  NodeSpan.runHandler,
                  { spanName: 'test.als.inner' },
                  (innerSpan) => {
                    expect(getIsolatedTracer().getActiveScopeSpan()).toBe(
                      innerSpan
                    )
                    return 'result'
                  }
                )
              }
            )
          })
        )

        const records = getSpanRecords()
        const traceIds = new Set(records.map((record) => record.traceId))
        const outerRecord = records.find(
          (record) => record.name === 'test.als.outer'
        )
        const innerRecord = records.find(
          (record) => record.name === 'test.als.inner'
        )

        expect(records).toHaveLength(2)
        expect(traceIds.size).toBe(1)
        expect(innerRecord?.parentSpanId).toBe(outerRecord?.spanId)
        expect(records).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'test.als.inner',
              attributes: expect.objectContaining({
                'next.span_name': 'test.als.inner',
                'next.span_type': NodeSpan.runHandler,
              }),
            }),
            expect.objectContaining({
              name: 'test.als.outer',
            }),
          ])
        )
        expect(
          records.some(
            (record) => record.attributes?.['next.work_unit.type'] !== undefined
          )
        ).toBe(false)
      } finally {
        setIsolatedSpanRecorderForTest?.(undefined)
        if (previousAsyncLocalStorage === undefined) {
          delete (globalThis as any).AsyncLocalStorage
        } else {
          ;(globalThis as any).AsyncLocalStorage = previousAsyncLocalStorage
        }
      }
    })
  })
})
