import type { AsyncLocalStorage } from 'async_hooks'
import type { Span } from 'next/dist/compiled/@opentelemetry/api'
import { PageNotFoundError } from '../../shared/lib/utils'
import { DevBundlerServiceSpan, type SpanTypes } from '../lib/trace/constants'
import {
  createOneShotTracePhase,
  isInternalTracingEnabled,
} from '../lib/trace/phase'
import { getTracer } from '../lib/trace/tracer'

type CompileRouteContext = {
  span: Span
  expectedResolutionMisses: WeakSet<PageNotFoundError>
  active: boolean
}

let compileRouteAsyncStorage: AsyncLocalStorage<CompileRouteContext> | undefined

type CompileRouteOutcome<T> =
  | { kind: 'result'; value: T }
  | { kind: 'resolution-miss'; error: PageNotFoundError }

function getCompileRouteAsyncStorage(): AsyncLocalStorage<CompileRouteContext> {
  if (!compileRouteAsyncStorage) {
    const { createAsyncLocalStorage } =
      require('../app-render/async-local-storage') as typeof import('../app-render/async-local-storage')
    compileRouteAsyncStorage = createAsyncLocalStorage()
  }
  return compileRouteAsyncStorage
}

async function runCompileRouteOperation<T>(
  operation: () => Promise<T>,
  compileRouteContext?: CompileRouteContext
): Promise<CompileRouteOutcome<T>> {
  try {
    return { kind: 'result', value: await operation() }
  } catch (error) {
    if (
      error instanceof PageNotFoundError &&
      compileRouteContext?.expectedResolutionMisses.delete(error)
    ) {
      return { kind: 'resolution-miss', error }
    }
    throw error
  } finally {
    if (compileRouteContext) {
      compileRouteContext.active = false
    }
  }
}

export async function traceCompileRoute<T>(
  operation: () => Promise<T>
): Promise<T> {
  if (!isInternalTracingEnabled()) {
    return await operation()
  }

  const outcome = await getTracer().trace(
    DevBundlerServiceSpan.ensurePage,
    { spanName: 'compile route' },
    (compileRouteSpan) => {
      if (!compileRouteSpan) {
        return runCompileRouteOperation(operation)
      }

      const compileRouteContext: CompileRouteContext = {
        span: compileRouteSpan,
        expectedResolutionMisses: new WeakSet(),
        active: true,
      }
      return getCompileRouteAsyncStorage().run(compileRouteContext, () =>
        runCompileRouteOperation(operation, compileRouteContext)
      )
    }
  )

  if (outcome.kind === 'resolution-miss') {
    throw outcome.error
  }
  return outcome.value
}

function getCompileRouteContext() {
  if (!isInternalTracingEnabled()) {
    return undefined
  }

  const compileRouteContext = compileRouteAsyncStorage?.getStore()
  const activeSpan = getTracer().getActiveScopeSpan()
  if (!compileRouteContext?.active || !activeSpan) {
    return undefined
  }

  const compileRouteSpan = compileRouteContext.span
  const compileRouteSpanContext = compileRouteSpan.spanContext()
  const activeContext = activeSpan.spanContext()
  return compileRouteSpanContext.traceId === activeContext.traceId &&
    compileRouteSpanContext.spanId === activeContext.spanId
    ? compileRouteContext
    : undefined
}

function getCompileRouteParentSpan() {
  return getCompileRouteContext()?.span
}

export async function traceCompileRoutePhase<T>(
  type: SpanTypes,
  spanName: string,
  operation: () => Promise<T>
): Promise<T> {
  const parentSpan = getCompileRouteParentSpan()

  // These phases describe work within `compile route`. An unrelated active
  // span or direct route probe must not become their owner.
  if (!parentSpan) {
    return await operation()
  }

  return await getTracer().trace(type, { spanName, parentSpan }, operation)
}

export async function traceCompileRouteResolution<T>(
  operation: () => Promise<T>
): Promise<T> {
  const compileRouteContext = getCompileRouteContext()
  if (!compileRouteContext) {
    return await operation()
  }

  const finishResolution = createOneShotTracePhase(
    DevBundlerServiceSpan.resolveRoute,
    'resolve route'
  )

  try {
    const result = await operation()
    finishResolution()
    return result
  } catch (error) {
    // Candidate-route misses are normal dev-server control flow. Do not emit a
    // failed child for a probe that its caller is expected to catch.
    if (error instanceof PageNotFoundError) {
      finishResolution()
      if (compileRouteContext.active) {
        compileRouteContext.expectedResolutionMisses.add(error)
      }
      throw error
    } else {
      finishResolution({ error })
      throw error
    }
  }
}
