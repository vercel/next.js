/**
 * @jest-environment node
 */

import type {
  Context,
  ContextManager,
  TextMapGetter,
  TextMapPropagator,
} from '@opentelemetry/api'
import {
  ROOT_CONTEXT,
  context,
  createContextKey,
  propagation,
  trace,
} from '@opentelemetry/api'

import {
  AppRenderSpan,
  BaseServerSpan,
  LoadComponentsSpan,
  NodeSpan,
} from './constants'
import {
  clearRequestInsightsForTest,
  finishRequestInsightSession,
  getRequestInsightsSnapshot,
  runWithRequestInsightsSession,
} from './request-insights'
import {
  registerRequestInsightsRuntime,
  unregisterRequestInsightsRuntimeForTest,
} from './request-insights-runtime'
import { getTracer } from './tracer'

const customContextKey = createContextKey('next.tracer.test.custom-context')
const originalDevServer = process.env.__NEXT_DEV_SERVER
const originalOtelVerbose = process.env.NEXT_OTEL_VERBOSE

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

describe('request insights tracing', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    delete process.env.NEXT_OTEL_VERBOSE
    trace.disable()
    registerRequestInsightsRuntime().setEnabled(true)
  })

  afterEach(() => {
    clearRequestInsightsForTest()
    unregisterRequestInsightsRuntimeForTest()
    trace.disable()

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
  })

  it('observes operations without substituting an OTel span', () => {
    let receivedSpan: unknown = 'not-called'

    runRequest(() => {
      const result = getTracer().trace(
        BaseServerSpan.render,
        { spanName: 'render dashboard' },
        (span) => {
          receivedSpan = span
          expect(getTracer().getActiveScopeSpan()).toBeUndefined()
          return 'result'
        }
      )

      expect(result).toBe('result')
    })

    expect(receivedSpan).toBeUndefined()
    expect(getRequestInsightsSnapshot().requests[0].operations).toEqual([
      expect.objectContaining({
        type: BaseServerSpan.render,
        name: 'render dashboard',
        category: 'nextjs',
        status: 'ok',
      }),
    ])
  })

  it('passes through the exact provider span while observing the operation', () => {
    const providerSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    })
    const end = jest.spyOn(providerSpan, 'end')
    trace.setGlobalTracerProvider({
      getTracer() {
        return {
          startSpan() {
            return providerSpan
          },
          startActiveSpan(...args: unknown[]) {
            const callback = args.at(-1) as (
              span: typeof providerSpan
            ) => unknown
            return callback(providerSpan)
          },
        }
      },
    })
    let receivedSpan: unknown

    runRequest(() => {
      getTracer().trace(NodeSpan.runHandler, (span) => {
        receivedSpan = span
      })
    })

    expect(receivedSpan).toBe(providerSpan)
    expect(end).toHaveBeenCalledTimes(1)
    expect(getRequestInsightsSnapshot().requests[0].operations).toEqual([
      expect.objectContaining({
        type: NodeSpan.runHandler,
        name: NodeSpan.runHandler,
      }),
    ])
    expect(getRequestInsightsSnapshot().requests[0].operations[0]).not.toEqual(
      expect.objectContaining({
        traceId: expect.anything(),
        spanId: expect.anything(),
      })
    )
  })

  it('observes non-allowlisted operations without exporting them', () => {
    const exportedOperations: string[] = []
    const providerSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    })
    trace.setGlobalTracerProvider({
      getTracer() {
        return {
          startSpan(name: string) {
            exportedOperations.push(name)
            return providerSpan
          },
          startActiveSpan(...args: unknown[]) {
            exportedOperations.push(args[0] as string)
            const callback = args.at(-1) as (
              span: typeof providerSpan
            ) => unknown
            return callback(providerSpan)
          },
        }
      },
    })

    runRequest(() => {
      getTracer().trace(BaseServerSpan.render, () => undefined)
      expect(exportedOperations).toEqual([])

      getTracer().trace(NodeSpan.runHandler, () => undefined)
      expect(exportedOperations).toEqual([NodeSpan.runHandler])

      process.env.NEXT_OTEL_VERBOSE = '1'
      getTracer().trace(BaseServerSpan.render, () => undefined)
    })

    expect(exportedOperations).toEqual([
      NodeSpan.runHandler,
      BaseServerSpan.render,
    ])
    expect(
      getRequestInsightsSnapshot().requests[0].operations.map(
        (operation) => operation.type
      )
    ).toEqual([
      BaseServerSpan.render,
      NodeSpan.runHandler,
      BaseServerSpan.render,
    ])
  })

  it('excludes hidden spans and generic AppRender.fetch spans', () => {
    const providerSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    })
    const startSpan = jest.fn(() => providerSpan)
    const startActiveSpan = jest.fn((...args: unknown[]) => {
      const callback = args.at(-1) as (span: typeof providerSpan) => unknown
      return callback(providerSpan)
    })
    trace.setGlobalTracerProvider({
      getTracer() {
        return { startSpan, startActiveSpan }
      },
    })
    let hiddenSpan: unknown = 'not-called'
    let fetchSpan: unknown = 'not-called'

    runRequest(() => {
      getTracer().trace(BaseServerSpan.render, { hideSpan: true }, (span) => {
        hiddenSpan = span
      })
      getTracer().trace(AppRenderSpan.fetch, (span) => {
        fetchSpan = span
      })
    })

    expect(hiddenSpan).toBeUndefined()
    expect(fetchSpan).toBe(providerSpan)
    expect(startSpan).not.toHaveBeenCalled()
    expect(startActiveSpan).toHaveBeenCalledTimes(1)
    expect(startActiveSpan).toHaveBeenCalledWith(
      AppRenderSpan.fetch,
      expect.any(Object),
      expect.any(Function)
    )
    expect(getRequestInsightsSnapshot().requests[0].operations).toEqual([])
  })

  it('keeps the request session but clears operation parentage when detached', () => {
    runRequest(() => {
      getTracer().trace(
        BaseServerSpan.render,
        { spanName: 'outer operation' },
        () => {
          getTracer().trace(
            AppRenderSpan.getBodyResult,
            { spanName: 'nested operation' },
            () => undefined
          )
          getTracer().runWithDetachedContext(() =>
            getTracer().trace(
              LoadComponentsSpan.loadComponents,
              { spanName: 'detached operation' },
              () => undefined
            )
          )
        }
      )
    })

    const operations = getRequestInsightsSnapshot().requests[0].operations
    expect(operations).toHaveLength(3)
    const outer = operations.find(
      (operation) => operation.name === 'outer operation'
    )
    const nested = operations.find(
      (operation) => operation.name === 'nested operation'
    )
    const detached = operations.find(
      (operation) => operation.name === 'detached operation'
    )

    expect(outer?.parentId).toBeUndefined()
    expect(nested?.parentId).toBe(outer?.id)
    expect(detached?.parentId).toBeUndefined()
  })

  it('records thrown, rejected, and callback errors before propagating them', async () => {
    await runWithRequestInsightsSession(
      {
        requestId: 'tracer-request',
        htmlRequestId: 'tracer-html',
        url: '/tracer',
        method: 'GET',
      },
      async () => {
        expect(() =>
          getTracer().trace(
            BaseServerSpan.render,
            { spanName: 'thrown operation' },
            () => {
              throw new TypeError('thrown boom')
            }
          )
        ).toThrow('thrown boom')

        await expect(
          getTracer().trace(
            AppRenderSpan.getBodyResult,
            { spanName: 'rejected operation' },
            async () => {
              throw new RangeError('rejected boom')
            }
          )
        ).rejects.toThrow('rejected boom')

        getTracer().trace(
          NodeSpan.runHandler,
          { spanName: 'callback operation' },
          (_span, done) => {
            done?.(new Error('callback boom'))
          }
        )

        finishRequestInsightSession({ statusCode: 500 })
      }
    )

    expect(getRequestInsightsSnapshot().requests[0].operations).toEqual([
      expect.objectContaining({
        name: 'thrown operation',
        status: 'error',
        error: { type: 'TypeError', message: 'thrown boom' },
      }),
      expect.objectContaining({
        name: 'rejected operation',
        status: 'error',
        error: { type: 'RangeError', message: 'rejected boom' },
      }),
      expect.objectContaining({
        name: 'callback operation',
        status: 'error',
        error: { type: 'Error', message: 'callback boom' },
      }),
    ])
  })

  it('does not observe framework operations outside a request session', () => {
    let receivedSpan: unknown = 'not-called'

    const result = getTracer().trace(BaseServerSpan.render, (span) => {
      receivedSpan = span
      return 'result'
    })

    expect(result).toBe('result')
    expect(receivedSpan).toBeUndefined()
    expect(getRequestInsightsSnapshot()).toEqual({ requests: [] })
  })
})

function runRequest(fn: () => void): void {
  runWithRequestInsightsSession(
    {
      requestId: 'tracer-request',
      htmlRequestId: 'tracer-html',
      url: '/tracer',
      method: 'GET',
    },
    () => {
      fn()
      finishRequestInsightSession({ route: '/tracer', statusCode: 200 })
    }
  )
}
